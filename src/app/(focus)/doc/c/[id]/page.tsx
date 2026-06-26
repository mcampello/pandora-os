import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import NotionDocEditor from "@/components/NotionDocEditor";
import { resolveDocBreadcrumb } from "@/lib/doc-breadcrumb";
import { CONTRACT_STATUS_LABEL, CONTRACT_STATUS_COLOR } from "@/lib/docs";
import type { ContractStatus } from "@/lib/types";

const STATUS_ORDER: ContractStatus[] = ["draft", "in_review", "signed", "active", "ended", "cancelled"];

const statusOptions = STATUS_ORDER.map((v) => ({
  value: v,
  label: CONTRACT_STATUS_LABEL[v],
  color: CONTRACT_STATUS_COLOR[v],
}));

export default async function DocContratoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data } = await supabase
    .from("contracts")
    .select("id, title, content_md, status, viewer_url, opportunity_id, company_id")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  const breadcrumb = await resolveDocBreadcrumb(supabase, {
    opportunity_id: data.opportunity_id,
    company_id: data.company_id,
  });

  return (
    <NotionDocEditor
      id={data.id}
      type="c"
      initialTitle={data.title}
      initialContent={data.content_md ?? ""}
      initialStatus={data.status as ContractStatus}
      viewerUrl={data.viewer_url ?? `https://app.campello.me/view/c/${data.id}`}
      statusOptions={statusOptions}
      apiPath="/api/contracts"
      breadcrumb={breadcrumb}
    />
  );
}
