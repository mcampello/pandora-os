import type { Task, TaskContext } from "./tasks";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = import("@supabase/supabase-js").SupabaseClient<any, any, any>;

// Status de contrato considerados "ativos" para fins de contexto.
const ACTIVE_CONTRACT_STATUS = ["active", "signed"];

type ClientRow = { id: string; company_name: string | null; status: string | null; contact_id: string | null };
type ContactRow = { id: string; name: string | null; company: string | null };
type OppRow = { id: string; title: string | null; status: string | null };
type PropRow = { id: string; title: string | null; status: string | null; client_id: string | null };
type DelivRow = { id: string; title: string | null; client_id: string | null };

// Deriva o conceito de negócio (prospect / contrato ativo / cliente) a partir do client.
function clientContext(
  client: ClientRow,
  hasActiveContract: boolean
): { kind: TaskContext["kind"]; label: string } {
  switch (client.status) {
    case "prospect": return { kind: "prospect", label: "Prospect" };
    case "active":   return hasActiveContract
      ? { kind: "contract", label: "Contrato ativo" }
      : { kind: "client",   label: "Cliente ativo" };
    case "paused":   return { kind: "client", label: "Cliente pausado" };
    case "former":   return { kind: "client", label: "Ex-cliente" };
    default:         return { kind: "client", label: "Cliente" };
  }
}

/**
 * Enriquece tarefas com um `context` unificado, resolvendo entity_type/entity_id
 * para o conceito de negócio (prospect, oportunidade, contrato ativo, etc.).
 * Faz batch queries — não escala por número de tarefas.
 */
export async function enrichTasksWithContext(
  supabase: AnySupabaseClient,
  tasks: Task[]
): Promise<Task[]> {
  if (tasks.length === 0) return tasks;

  const ids: Record<string, Set<string>> = {
    contact: new Set(), client: new Set(), opportunity: new Set(),
    proposal: new Set(), deliverable: new Set(),
  };
  for (const t of tasks) {
    if (t.entity_id && t.entity_type && ids[t.entity_type]) ids[t.entity_type].add(t.entity_id);
  }
  const arr = (s: Set<string>) => Array.from(s);
  const has = (s: Set<string>) => s.size > 0;
  const EMPTY = { data: [] as never[] };

  // Passo 1: entidades referenciadas diretamente.
  const [contactsRes, clientsRes, oppsRes, propsRes, delivsRes] = await Promise.all([
    has(ids.contact)     ? supabase.from("contacts").select("id, name, company").in("id", arr(ids.contact)) : EMPTY,
    has(ids.client)      ? supabase.from("clients").select("id, company_name, status, contact_id").in("id", arr(ids.client)) : EMPTY,
    has(ids.opportunity) ? supabase.from("opportunities").select("id, title, status").in("id", arr(ids.opportunity)) : EMPTY,
    has(ids.proposal)    ? supabase.from("proposals").select("id, title, status, client_id").in("id", arr(ids.proposal)) : EMPTY,
    has(ids.deliverable) ? supabase.from("deliverables").select("id, title, client_id").in("id", arr(ids.deliverable)) : EMPTY,
  ]);

  const contactById = new Map<string, ContactRow>((contactsRes.data ?? []).map((c: ContactRow) => [c.id, c]));
  const oppById     = new Map<string, OppRow>((oppsRes.data ?? []).map((o: OppRow) => [o.id, o]));
  const propById    = new Map<string, PropRow>((propsRes.data ?? []).map((p: PropRow) => [p.id, p]));
  const delivById   = new Map<string, DelivRow>((delivsRes.data ?? []).map((d: DelivRow) => [d.id, d]));
  const clientById  = new Map<string, ClientRow>((clientsRes.data ?? []).map((c: ClientRow) => [c.id, c]));

  // Passo 2: clients referenciados indiretamente (via proposta, entrega ou contato).
  const indirectClientIds = new Set<string>();
  for (const p of propById.values())  if (p.client_id) indirectClientIds.add(p.client_id);
  for (const d of delivById.values()) if (d.client_id) indirectClientIds.add(d.client_id);
  for (const id of clientById.keys()) indirectClientIds.delete(id); // já carregados
  const contactIds = arr(ids.contact);

  const [extraClientsRes, clientsByContactRes] = await Promise.all([
    has(indirectClientIds)
      ? supabase.from("clients").select("id, company_name, status, contact_id").in("id", arr(indirectClientIds)) : EMPTY,
    contactIds.length
      ? supabase.from("clients").select("id, company_name, status, contact_id").in("contact_id", contactIds) : EMPTY,
  ]);
  for (const c of (extraClientsRes.data ?? []) as ClientRow[]) clientById.set(c.id, c);
  const clientByContactId = new Map<string, ClientRow>();
  for (const c of (clientsByContactRes.data ?? []) as ClientRow[]) {
    if (c.contact_id) clientByContactId.set(c.contact_id, c);
    clientById.set(c.id, c);
  }

  // Passo 3: contratos ativos por cliente.
  const allClientIds = arr(new Set(clientById.keys()));
  const activeContractClientIds = new Set<string>();
  if (allClientIds.length) {
    const { data: contracts } = await supabase
      .from("contracts").select("client_id, status")
      .in("client_id", allClientIds).in("status", ACTIVE_CONTRACT_STATUS);
    for (const c of (contracts ?? []) as { client_id: string | null }[]) {
      if (c.client_id) activeContractClientIds.add(c.client_id);
    }
  }

  const buildContext = (task: Task): TaskContext | null => {
    const id = task.entity_id;
    if (!id || !task.entity_type) return null;

    switch (task.entity_type) {
      case "opportunity": {
        const o = oppById.get(id); if (!o) return null;
        return { kind: "opportunity", label: "Oportunidade", name: o.title ?? "Oportunidade", status: o.status, href: `/oportunidades/${id}` };
      }
      case "client": {
        const c = clientById.get(id); if (!c) return null;
        const base = clientContext(c, activeContractClientIds.has(id));
        return { ...base, name: c.company_name ?? "Cliente", status: c.status, href: `/operacao/${id}` };
      }
      case "contact": {
        const ct = contactById.get(id); if (!ct) return null;
        const linked = clientByContactId.get(id);
        const name = ct.name ?? ct.company ?? "Contato";
        if (linked) {
          const base = clientContext(linked, activeContractClientIds.has(linked.id));
          return { ...base, name, status: linked.status, href: `/clientes/${id}` };
        }
        return { kind: "contact", label: "Contato", name, href: `/clientes/${id}` };
      }
      case "proposal": {
        const p = propById.get(id); if (!p) return null;
        const c = p.client_id ? clientById.get(p.client_id) : null;
        const name = c?.company_name ? `${p.title ?? "Proposta"} · ${c.company_name}` : (p.title ?? "Proposta");
        return { kind: "proposal", label: "Proposta", name, status: p.status, href: `/propostas` };
      }
      case "deliverable": {
        const d = delivById.get(id); if (!d) return null;
        const c = d.client_id ? clientById.get(d.client_id) : null;
        const name = c?.company_name ? `${d.title ?? "Entrega"} · ${c.company_name}` : (d.title ?? "Entrega");
        return { kind: "deliverable", label: "Entrega", name, href: d.client_id ? `/operacao/${d.client_id}` : `/operacao` };
      }
      default:
        return null;
    }
  };

  return tasks.map((t) => ({ ...t, context: buildContext(t) }));
}
