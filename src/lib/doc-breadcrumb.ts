import type { supabaseServer } from "@/lib/supabase-server";

type ServerClient = Awaited<ReturnType<typeof supabaseServer>>;

export interface DocBreadcrumb {
  company?: { id: string; name: string } | null;     // empresa
  contact?: { id: string; name: string } | null;     // pessoa
  opportunity?: { id: string; title: string } | null; // oportunidade
}

/**
 * Resolve a cadeia Empresa › Pessoa › Oportunidade de um documento.
 * Cada elo degrada graciosamente: se faltar um dado, o breadcrumb mostra só o que existe.
 */
export async function resolveDocBreadcrumb(
  supabase: ServerClient,
  doc: { opportunity_id?: string | null; company_id?: string | null },
): Promise<DocBreadcrumb> {
  let company: DocBreadcrumb["company"] = null;
  let contact: DocBreadcrumb["contact"] = null;
  let opportunity: DocBreadcrumb["opportunity"] = null;

  if (doc.opportunity_id) {
    const { data: opp } = await supabase
      .from("opportunities")
      .select("id, title, contact_id, company_id")
      .eq("id", doc.opportunity_id)
      .maybeSingle();

    if (opp) {
      opportunity = { id: opp.id, title: opp.title };
      if (opp.contact_id) {
        const { data: c } = await supabase
          .from("contacts").select("id, name").eq("id", opp.contact_id).maybeSingle();
        if (c) contact = c;
      }
      const companyId = opp.company_id ?? doc.company_id;
      if (companyId) {
        const { data: co } = await supabase
          .from("companies").select("id, name").eq("id", companyId).maybeSingle();
        if (co) company = co;
      }
    }
  } else if (doc.company_id) {
    const { data: co } = await supabase
      .from("companies").select("id, name").eq("id", doc.company_id).maybeSingle();
    if (co) company = co;
  }

  return { company, contact, opportunity };
}
