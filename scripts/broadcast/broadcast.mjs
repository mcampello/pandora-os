#!/usr/bin/env node
/**
 * Pandora Broadcast — disparo pontual de mensagens WhatsApp via uazapi.
 *
 * Projeto PARALELO ao Pandora OS. Usa o token uazapi da Pandora (mesma instância
 * de envio: pandora.uazapi.com). Sem dependências externas — só fetch nativo
 * (Node 18+). Roda onde houver acesso de rede ao uazapi (ex.: o VPS).
 *
 * Fluxo típico:
 *   1) node broadcast.mjs lists                 # mostra grupos e etiquetas
 *   2) node broadcast.mjs members --group <jid> # ou --label <nome>  → exporta CSV p/ revisar
 *   3) node broadcast.mjs send --from recipients.csv --text msg.txt --media banner.png --type image
 *
 * Config (variáveis de ambiente OU arquivo scripts/broadcast/.env):
 *   UAZAPI_BASE_URL   default https://pandora.uazapi.com
 *   UAZAPI_TOKEN      instance_token do connector whatsapp (NÃO commitar)
 *   UAZAPI_MEDIA_FORMAT  v2 (type/file, default) | v1 (mediatype/media)
 *
 * Segurança de disparo:
 *   - throttle com jitter entre mensagens (--delay, default 8000ms)
 *   - --dry-run para simular sem enviar
 *   - --limit N para testar com poucos
 *   - log de enviados (.sent-<campanha>.log) → reexecução pula quem já recebeu
 */

import { readFileSync, existsSync, appendFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";

const HERE = dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────────────────
function loadDotEnv() {
  const envPath = join(HERE, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotEnv();

const BASE = (process.env.UAZAPI_BASE_URL ?? "https://pandora.uazapi.com").replace(/\/$/, "");
const TOKEN = process.env.UAZAPI_TOKEN ?? "";
const MEDIA_FORMAT = (process.env.UAZAPI_MEDIA_FORMAT ?? "v2").toLowerCase();

function requireToken() {
  if (!TOKEN) {
    console.error("✗ UAZAPI_TOKEN não definido. Defina no ambiente ou em scripts/broadcast/.env");
    console.error("  (é o instance_token do connector 'whatsapp' da Pandora OS)");
    process.exit(1);
  }
}

// ── uazapi client ─────────────────────────────────────────────────────────────
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { token: TOKEN, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`uazapi ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return json;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function onlyDigits(s) { return String(s ?? "").replace(/\D/g, ""); }

/** Extrai o número (digits) de um jid/objeto de participante ou chat. */
function numberFrom(x) {
  if (!x) return "";
  if (typeof x === "string") return onlyDigits(x.split("@")[0]);
  const cand = x.id ?? x.jid ?? x.wa_chatid ?? x.phone ?? x.number ?? x.participant ?? "";
  return onlyDigits(String(cand).split("@")[0]);
}

function nameFrom(x, fallback = "") {
  if (!x || typeof x === "string") return fallback;
  return x.name ?? x.wa_name ?? x.wa_contactName ?? x.pushName ?? x.notify ?? x.subject ?? fallback;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) { args[key] = true; }
      else { args[key] = next; i++; }
    } else {
      args._.push(a);
    }
  }
  return args;
}

// CSV mínimo (campos sem aspas/quebras — suficiente p/ nome+telefone)
function toCSV(rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return ["name,number", ...rows.map((r) => `${esc(r.name)},${esc(r.number)}`)].join("\n") + "\n";
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  // detecta header
  const header = lines[0].toLowerCase();
  const hasHeader = /number|telefone|phone|name|nome/.test(header);
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const cols = hasHeader ? lines[0].split(",").map((c) => c.trim().toLowerCase()) : null;
  const numIdx = cols ? cols.findIndex((c) => /number|telefone|phone/.test(c)) : -1;
  const nameIdx = cols ? cols.findIndex((c) => /name|nome/.test(c)) : -1;
  const out = [];
  for (const line of dataLines) {
    const parts = line.split(",");
    let number, name;
    if (cols) {
      number = onlyDigits(parts[numIdx >= 0 ? numIdx : parts.length - 1]);
      name = (nameIdx >= 0 ? parts[nameIdx] : "")?.trim() ?? "";
    } else {
      number = onlyDigits(parts[parts.length === 1 ? 0 : 1] ?? parts[0]);
      name = parts.length > 1 ? parts[0].trim() : "";
    }
    if (number) out.push({ name, number });
  }
  return out;
}

// ── Comando: lists ─────────────────────────────────────────────────────────────
async function fetchGroups() {
  try {
    const r = await api("/group/list");
    const groups = r.groups ?? r ?? [];
    return (Array.isArray(groups) ? groups : []).map((g) => ({
      jid: g.id ?? g.jid ?? g.wa_chatid ?? "",
      name: g.name ?? g.subject ?? g.wa_name ?? "(sem nome)",
      count: Array.isArray(g.participants) ? g.participants.length : (g.size ?? null),
    }));
  } catch (e) {
    console.error("  (grupos indisponíveis:", e.message, ")");
    return [];
  }
}

async function fetchLabels() {
  try {
    const r = await api("/labels");
    const labels = Array.isArray(r) ? r : (r.labels ?? []);
    return labels.map((l) => ({
      id: l.id ?? l.labelId ?? l.wa_label ?? "",
      name: l.name ?? l.labelName ?? "(sem nome)",
      color: l.color ?? l.colorIndex ?? null,
    }));
  } catch (e) {
    console.error("  (etiquetas indisponíveis:", e.message, ")");
    return [];
  }
}

async function cmdLists() {
  requireToken();
  const [groups, labels] = await Promise.all([fetchGroups(), fetchLabels()]);

  console.log("\n━━ GRUPOS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (!groups.length) console.log("  (nenhum)");
  groups.forEach((g, i) => {
    const c = g.count != null ? ` · ${g.count} membros` : "";
    console.log(`  [g${i + 1}] ${g.name}${c}\n        --group ${g.jid}`);
  });

  console.log("\n━━ ETIQUETAS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (!labels.length) console.log("  (nenhuma)");
  labels.forEach((l, i) => {
    console.log(`  [e${i + 1}] ${l.name}\n        --label "${l.name}"   (id: ${l.id})`);
  });

  console.log("\nPróximo passo: exporte os membros para revisar antes de disparar:");
  console.log("  node broadcast.mjs members --group <jid>   --out recipients.csv");
  console.log('  node broadcast.mjs members --label "<nome>" --out recipients.csv\n');
}

// ── Comando: members ───────────────────────────────────────────────────────────
async function resolveGroupMembers(jid) {
  const r = await api("/group/info", { method: "POST", body: { groupJid: jid, getParticipants: true } });
  const g = r.group ?? r;
  const participants = g.participants ?? g.members ?? [];
  return participants.map((p) => ({ name: nameFrom(p), number: numberFrom(p) })).filter((x) => x.number);
}

async function resolveLabelMembers(label) {
  const out = [];
  const seen = new Set();
  let offset = 0;
  const limit = 200;
  for (let page = 0; page < 100; page++) {
    const r = await api("/chat/find", {
      method: "POST",
      body: { wa_label: label, wa_isGroup: false, limit, offset },
    });
    const chats = r.chats ?? r.results ?? (Array.isArray(r) ? r : []);
    for (const c of chats) {
      const number = numberFrom(c);
      if (!number || seen.has(number)) continue;
      seen.add(number);
      out.push({ name: nameFrom(c), number });
    }
    if (!chats.length || chats.length < limit || r.hasMore === false) break;
    offset += limit;
  }
  return out;
}

async function cmdMembers(args) {
  requireToken();
  let rows;
  if (args.group) {
    console.log(`Buscando membros do grupo ${args.group}…`);
    rows = await resolveGroupMembers(String(args.group));
  } else if (args.label) {
    console.log(`Buscando contatos com etiqueta "${args.label}"…`);
    rows = await resolveLabelMembers(String(args.label));
  } else {
    console.error("Informe --group <jid> ou --label <nome>");
    process.exit(1);
  }

  console.log(`→ ${rows.length} destinatários encontrados.`);
  const out = args.out ? resolve(String(args.out)) : null;
  if (out) {
    writeFileSync(out, toCSV(rows));
    console.log(`✓ Salvo em ${out} (revise/edite antes de disparar)`);
  } else {
    rows.forEach((r) => console.log(`  ${r.number}\t${r.name}`));
    console.log("\nDica: use --out recipients.csv para salvar e revisar.");
  }
}

// ── Envio ──────────────────────────────────────────────────────────────────────
function buildMediaBody(number, file, type, caption) {
  if (MEDIA_FORMAT === "v1") {
    return { number, mediatype: type === "ptt" ? "audio" : type, media: file, caption };
  }
  // v2 (documentado)
  return { number, type, file, text: caption };
}

function mediaDataUri(path) {
  const abs = resolve(path);
  const buf = readFileSync(abs);
  const ext = abs.toLowerCase().split(".").pop();
  const mime = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
    gif: "image/gif", mp4: "video/mp4", pdf: "application/pdf",
    mp3: "audio/mpeg", ogg: "audio/ogg", m4a: "audio/mp4",
  }[ext] ?? "application/octet-stream";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function cmdSend(args) {
  requireToken();

  // 1) destinatários
  let rows;
  if (args.from) {
    rows = parseCSV(readFileSync(resolve(String(args.from)), "utf-8"));
  } else if (args.group) {
    rows = await resolveGroupMembers(String(args.group));
  } else if (args.label) {
    rows = await resolveLabelMembers(String(args.label));
  } else {
    console.error("Informe --from <arquivo.csv> ou --group <jid> ou --label <nome>");
    process.exit(1);
  }
  if (args.limit) rows = rows.slice(0, Number(args.limit));
  if (!rows.length) { console.error("Nenhum destinatário."); process.exit(1); }

  // 2) mensagem
  let text = "";
  if (args.text) {
    const tv = String(args.text);
    text = existsSync(tv) ? readFileSync(resolve(tv), "utf-8").trim() : tv;
  }
  const mediaPath = args.media ? String(args.media) : null;
  const mediaType = args.type ? String(args.type) : "image";
  let mediaPayload = null;
  if (mediaPath) {
    mediaPayload = /^https?:\/\//.test(mediaPath) ? mediaPath : mediaDataUri(mediaPath);
  }
  if (!text && !mediaPayload) { console.error("Forneça --text e/ou --media."); process.exit(1); }

  // 3) parâmetros de throttle
  const delay = Number(args.delay ?? 8000);     // gap base entre msgs (ms)
  const jitter = Number(args.jitter ?? 4000);   // variação aleatória adicional
  const dryRun = !!args["dry-run"];
  const campaign = String(args.campaign ?? "default").replace(/[^\w.-]/g, "_");
  const sentLog = join(HERE, `.sent-${campaign}.log`);
  const already = new Set(
    existsSync(sentLog) ? readFileSync(sentLog, "utf-8").split("\n").map(onlyDigits).filter(Boolean) : []
  );

  // 4) preview + confirmação
  console.log("\n━━ PREVIEW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Destinatários:   ${rows.length}  (já enviados antes: ${rows.filter(r => already.has(r.number)).length})`);
  console.log(`Mídia:           ${mediaPath ? `${mediaType} → ${mediaPath}` : "—"}`);
  console.log(`Throttle:        ${delay}ms + até ${jitter}ms aleatório`);
  console.log(`Campanha:        ${campaign}  (log: ${sentLog})`);
  console.log(`Modo:            ${dryRun ? "DRY-RUN (não envia)" : "ENVIO REAL"}`);
  if (text) {
    console.log("Texto:");
    console.log(text.split("\n").map((l) => "  | " + l).join("\n"));
  }
  console.log("Amostra:", rows.slice(0, 5).map((r) => r.number).join(", "), rows.length > 5 ? "…" : "");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  if (!dryRun && !args.yes) {
    const rl = createInterface({ input: stdin, output: stdout });
    const ans = await rl.question(`Confirmar ENVIO para ${rows.length} números? (digite "enviar"): `);
    rl.close();
    if (ans.trim().toLowerCase() !== "enviar") { console.log("Cancelado."); process.exit(0); }
  }

  // 5) loop de envio
  let ok = 0, skip = 0, fail = 0;
  for (let i = 0; i < rows.length; i++) {
    const { number, name } = rows[i];
    const tag = `[${i + 1}/${rows.length}] ${number}${name ? ` (${name})` : ""}`;
    if (already.has(number)) { console.log(`${tag} ⏭  já enviado`); skip++; continue; }

    if (dryRun) { console.log(`${tag} ✓ (dry-run)`); ok++; continue; }

    try {
      if (mediaPayload) {
        await api("/send/media", { method: "POST", body: buildMediaBody(number, mediaPayload, mediaType, text || undefined) });
      } else {
        await api("/send/text", { method: "POST", body: { number, text } });
      }
      appendFileSync(sentLog, number + "\n");
      console.log(`${tag} ✓ enviado`);
      ok++;
    } catch (e) {
      console.log(`${tag} ✗ ${e.message}`);
      fail++;
    }

    if (i < rows.length - 1) await sleep(delay + Math.floor(Math.random() * jitter));
  }

  console.log(`\n━━ FIM ━━  enviados=${ok}  pulados=${skip}  falhas=${fail}`);
}

// ── Main ────────────────────────────────────────────────────────────────────────
const HELP = `Pandora Broadcast — disparo WhatsApp via uazapi

Uso:
  node broadcast.mjs lists
  node broadcast.mjs members (--group <jid> | --label <nome>) [--out file.csv]
  node broadcast.mjs send    (--from file.csv | --group <jid> | --label <nome>)
                             [--text "msg" | --text msg.txt] [--media path|url --type image]
                             [--delay 8000] [--jitter 4000] [--limit N]
                             [--campaign nome] [--dry-run] [--yes]

Env: UAZAPI_TOKEN (obrigatório), UAZAPI_BASE_URL, UAZAPI_MEDIA_FORMAT(v2|v1)
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  try {
    switch (cmd) {
      case "lists":   await cmdLists(); break;
      case "members": await cmdMembers(args); break;
      case "send":    await cmdSend(args); break;
      default: console.log(HELP);
    }
  } catch (e) {
    console.error("✗", e.message);
    process.exit(1);
  }
}
main();
