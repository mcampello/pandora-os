#!/usr/bin/env node
/**
 * Migra documentos do pandora-sales para o Supabase (proposals + contracts).
 * Uso: node scripts/migrate-pandora-sales.mjs
 * Requer: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL      = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.campello.me";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── Mapa de documentos a migrar ──────────────────────────────────────────────
// type: "proposal" | "contract"
// status: valor inicial no banco
// group: (opcional) documentos do mesmo grupo (versões)
const DOCS = [
  // Baila Creative — Contratos
  { file: "/root/pandora-sales/clients/baila-creative/contrato.md",          type: "contract",  title: "Contrato de Prestação de Serviços · Baila Mídia (V1)",      client: "Baila Creative", status: "ended",  group: "baila-contrato" },
  { file: "/root/pandora-sales/clients/baila-creative/contrato-aprovado.md", type: "contract",  title: "Contrato Aprovado · Baila Mídia",                           client: "Baila Creative", status: "ended",  group: "baila-contrato" },
  { file: "/root/pandora-sales/clients/baila-creative/contrato-v2.md",       type: "contract",  title: "Contrato de Prestação de Serviços · Baila Mídia (V2)",      client: "Baila Creative", status: "signed", group: "baila-contrato" },
  { file: "/root/pandora-sales/clients/baila-creative/termo-aditivo-1-fee-mensal-v3.md", type: "contract", title: "1º Termo Aditivo · Fee Mensal (V3)", client: "Baila Creative", status: "active", group: "baila-ta-fee" },

  // Baila Creative — Propostas
  { file: "/root/pandora-sales/clients/baila-creative/orcamento-fase-1-plataforma-gestao-midia.md",    type: "proposal", title: "Proposta Fase 1 · Plataforma de Gestão de Mídia",           client: "Baila Creative", status: "accepted", group: "baila-prop-fase1" },
  { file: "/root/pandora-sales/clients/baila-creative/proposta-fee-mensal-desenvolvimento-continuo.md", type: "proposal", title: "Proposta Fee Mensal · Desenvolvimento Contínuo (V1)",       client: "Baila Creative", status: "expired",  group: "baila-prop-fee" },
  { file: "/root/pandora-sales/clients/baila-creative/proposta-fee-mensal-desenvolvimento-continuo-v3.md", type: "proposal", title: "Proposta Fee Mensal · Desenvolvimento Contínuo (V3)",   client: "Baila Creative", status: "sent",    group: "baila-prop-fee" },

  // Nasajon — Propostas e Contratos
  { file: "/root/pandora-sales/clients/nasajon/proposta-sessoes-ao-vivo-consultoria-ia.md",   type: "proposal", title: "Proposta · Sessões ao Vivo de Consultoria em IA",             client: "Nasajon", status: "sent",    group: "nasajon-prop-sessoes" },
  { file: "/root/pandora-sales/clients/nasajon/contrato-parceria-educacional-ia.md",          type: "contract", title: "Contrato · Parceria Educacional em IA (V1)",                   client: "Nasajon", status: "ended",  group: "nasajon-contrato-ia" },
  { file: "/root/pandora-sales/clients/nasajon/contrato-parceria-educacional-ia-v2.md",       type: "contract", title: "Contrato · Parceria Educacional em IA (V2)",                   client: "Nasajon", status: "ended",  group: "nasajon-contrato-ia" },
  { file: "/root/pandora-sales/clients/nasajon/contrato-parceria-educacional-ia-v3.md",       type: "contract", title: "Contrato · Parceria Educacional em IA (V3)",                   client: "Nasajon", status: "active", group: "nasajon-contrato-ia" },

  // MRM/Scuderia
  { file: "/root/pandora-sales/clients/mrm/proposta-mrm.md",                 type: "proposal", title: "Proposta Avengers · Experiência de Quadrinhos com IA",        client: "MRM",     status: "accepted", group: "mrm-prop-avengers" },
  { file: "/root/pandora-sales/clients/mrm/contrato-proposta-avengers.md",   type: "contract", title: "Contrato · Proposta Avengers (Scuderia/MRM)",                  client: "MRM",     status: "active",   group: "mrm-contrato-avengers" },

  // Hamilton
  { file: "/root/pandora-sales/clients/Hamilton/orcamento.md",               type: "proposal", title: "Orçamento · Hamilton",                                         client: "Hamilton", status: "sent",    group: "hamilton-prop" },
];

// ── Caches para evitar queries duplicadas ────────────────────────────────────
const clientCache = {};    // company_name → client_id
const groupCache = {};     // group slug → { proposal_group_id | contract_group_id, version }

async function getOrCreateClientId(companyName) {
  if (clientCache[companyName]) return clientCache[companyName];

  const { data } = await supabase.from("clients").select("id").ilike("company_name", `%${companyName}%`).maybeSingle();
  if (data) { clientCache[companyName] = data.id; return data.id; }

  // Cria o client se não existir
  const { data: created } = await supabase.from("clients").insert({ company_name: companyName, status: "active" }).select("id").single();
  clientCache[companyName] = created.id;
  return created.id;
}

async function migrate() {
  console.log(`Migrando ${DOCS.length} documentos…\n`);

  for (const doc of DOCS) {
    let content_md;
    try {
      content_md = readFileSync(doc.file, "utf-8");
    } catch {
      console.warn(`  ⚠ Arquivo não encontrado: ${doc.file}`);
      continue;
    }

    const client_id = await getOrCreateClientId(doc.client);

    // Versão: primeira ocorrência do grupo é version 1, segunda é 2, etc.
    if (!groupCache[doc.group]) groupCache[doc.group] = { version: 0 };
    groupCache[doc.group].version += 1;
    const version = groupCache[doc.group].version;

    const table = doc.type === "proposal" ? "proposals" : "contracts";
    const groupCol = doc.type === "proposal" ? "proposal_group_id" : "contract_group_id";

    // Reutiliza o group_id do primeiro do grupo
    if (!groupCache[doc.group].groupId) {
      groupCache[doc.group].groupId = crypto.randomUUID();
    }
    const groupId = groupCache[doc.group].groupId;

    const insert = {
      title: doc.title,
      content_md,
      client_id,
      status: doc.status,
      version,
      [groupCol]: groupId,
    };

    const { data, error } = await supabase.from(table).insert(insert).select("id").single();

    if (error) {
      console.error(`  ✗ ${doc.title}: ${error.message}`);
      continue;
    }

    const viewerPath = doc.type === "proposal" ? "p" : "c";
    const viewer_url = `${APP_URL}/view/${viewerPath}/${data.id}`;
    await supabase.from(table).update({ viewer_url }).eq("id", data.id);

    console.log(`  ✓ [v${version}] ${doc.title} → ${viewer_url}`);
  }

  console.log("\nMigração concluída.");
}

migrate().catch(err => { console.error(err); process.exit(1); });
