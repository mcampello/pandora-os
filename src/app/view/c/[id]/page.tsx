import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import DocViewerClient from "@/components/DocViewerClient";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
}

async function fetchContract(id: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data } = await supabase
    .from("contracts")
    .select("id, title, content_md, status, client:clients(company_name)")
    .eq("id", id)
    .neq("status", "draft")
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const doc = await fetchContract(id);
  return { title: doc ? `${doc.title} — Pandora` : "Contrato" };
}

export default async function ContractViewerPage({ params }: Props) {
  const { id } = await params;
  const doc = await fetchContract(id);
  if (!doc || !doc.content_md) notFound();

  const clientName = (doc.client as { company_name?: string } | null)?.company_name;
  const subtitle = clientName ? `Contrato · ${clientName}` : "Contrato de prestação de serviços";

  return (
    <DocViewerClient
      id={id}
      type="c"
      title={doc.title}
      subtitle={subtitle}
      content={doc.content_md}
      status={doc.status}
    />
  );
}
