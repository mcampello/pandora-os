#!/usr/bin/env node
/**
 * Importa documentos do pandora-sales para o Supabase via REST API + fetch.
 * Sem dependência de WebSocket — usa apenas fetch nativo do Node 18+.
 * Uso: node scripts/import-pandora-sales.mjs
 */

import { readFileSync } from "fs";

const BASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL     = process.env.ADMIN_EMAIL;
const PASSWORD  = process.env.ADMIN_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("ADMIN_EMAIL e ADMIN_PASSWORD são obrigatórios.");
  process.exit(1);
}
const APP_URL   = "https://app.campello.me";

if (!BASE_URL || !ANON_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórios.");
  process.exit(1);
}

function read(path) { return readFileSync(path, "utf-8"); }

// ── Autenticação ────────────────────────────────────────────────────────────
async function getToken() {
  const res = await fetch(`${BASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "apikey": ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Auth falhou: ${JSON.stringify(json)}`);
  return json.access_token;
}

// ── REST helpers ────────────────────────────────────────────────────────────
function headers(token) {
  return {
    "apikey": ANON_KEY,
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
  };
}

async function patchRow(token, table, id, payload) {
  const res = await fetch(`${BASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PATCH ${table}/${id}: ${res.status} ${body}`);
  }
}

async function insertRow(token, table, payload) {
  const res = await fetch(`${BASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...headers(token), "Prefer": "return=minimal" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`INSERT ${table}: ${res.status} ${body}`);
  }
}

// ── Dados ───────────────────────────────────────────────────────────────────
const UPDATES = [
  {
    table: "contracts", id: "fdece759-2418-40a5-b472-5af617fca1f5",
    title: "Contrato de Prestação de Serviços · Baila Mídia (V2 Consolidado)",
    file: "/tmp/pandora-sales/clients/baila-creative/contrato-v2.md",
  },
  {
    table: "contracts", id: "0c276e21-a698-4c18-8ae0-036e18197cc2",
    title: "1º Termo Aditivo · Fee Mensal (V3)",
    file: "/tmp/pandora-sales/clients/baila-creative/termo-aditivo-1-fee-mensal-v3.md",
  },
  {
    table: "contracts", id: "d5db9626-68fa-4215-993c-56003d290d5b",
    title: "Contrato · Proposta Avengers (Scuderia/MRM)",
    file: "/tmp/pandora-sales/clients/mrm/contrato-proposta-avengers.md",
  },
  {
    table: "contracts", id: "2dbe5d48-6a04-4aa3-8fc4-377f2e909628",
    title: "Contrato · Parceria Educacional em IA (V3 — atual)",
    file: "/tmp/pandora-sales/clients/nasajon/contrato-parceria-educacional-ia-v3.md",
  },
  {
    table: "proposals", id: "23b0be13-50d7-45ef-9a20-6cd93fe208ef",
    title: "Orçamento · Hamilton",
    file: "/tmp/pandora-sales/clients/Hamilton/orcamento.md",
  },
];

const INSERTS = [
  {
    table: "contracts",
    client_id: "7480f873-2d6c-46b8-a3db-a982a3822fe3",
    contract_group_id: "177e16b7-1b57-4295-abfd-17c9ee74cb2d",
    version: 2, status: "ended",
    title: "Contrato · Parceria Educacional em IA (V1 — arquivo)",
    file: "/tmp/pandora-sales/clients/nasajon/contrato-parceria-educacional-ia.md",
  },
  {
    table: "contracts",
    client_id: "7480f873-2d6c-46b8-a3db-a982a3822fe3",
    contract_group_id: "177e16b7-1b57-4295-abfd-17c9ee74cb2d",
    version: 3, status: "ended",
    title: "Contrato · Parceria Educacional em IA (V2 — arquivo)",
    file: "/tmp/pandora-sales/clients/nasajon/contrato-parceria-educacional-ia-v2.md",
  },
  {
    table: "contracts",
    client_id: "1f0938c3-635f-4490-b170-81e62638f47c",
    contract_group_id: "e49febba-59fb-45de-8087-d61fca803aa3",
    version: 2, status: "ended",
    title: "Contrato de Prestação de Serviços · Baila Mídia (V1 — arquivo)",
    file: "/tmp/pandora-sales/clients/baila-creative/contrato.md",
  },
  {
    table: "contracts",
    client_id: "1f0938c3-635f-4490-b170-81e62638f47c",
    contract_group_id: "e49febba-59fb-45de-8087-d61fca803aa3",
    version: 3, status: "ended",
    title: "Contrato Aprovado · Baila Mídia (arquivo)",
    file: "/tmp/pandora-sales/clients/baila-creative/contrato-aprovado.md",
  },
];

// ── Execução ────────────────────────────────────────────────────────────────
async function run() {
  const token = await getToken();
  console.log("✓ Autenticado como", EMAIL, "\n");

  console.log(`=== UPDATES (${UPDATES.length}) ===`);
  for (const u of UPDATES) {
    const content_md = read(u.file);
    await patchRow(token, u.table, u.id, { content_md, title: u.title });
    console.log(`  ✓ ${u.title} (${content_md.length} chars)`);
  }

  console.log(`\n=== INSERTS (${INSERTS.length}) ===`);
  for (const ins of INSERTS) {
    const content_md = read(ins.file);
    const viewer_url = `${APP_URL}/view/c/${crypto.randomUUID()}`;
    await insertRow(token, ins.table, {
      client_id:         ins.client_id,
      contract_group_id: ins.contract_group_id,
      version:           ins.version,
      status:            ins.status,
      title:             ins.title,
      content_md,
      viewer_url,
    });
    console.log(`  ✓ ${ins.title} (${content_md.length} chars)`);
  }

  console.log("\n✓ Importação concluída.");
}

run().catch(err => { console.error("✗", err.message); process.exit(1); });
