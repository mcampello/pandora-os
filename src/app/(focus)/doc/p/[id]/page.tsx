import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import NotionDocEditor from "@/components/NotionDocEditor";
import { resolveDocBreadcrumb } from "@/lib/doc-breadcrumb";
import { PROPOSAL_STATUS_LABEL, PROPOSAL_STATUS_COLOR } from "@/lib/docs";
import type { ProposalStatus } from "@/lib/types";

const STATUS_ORDER: ProposalStatus[] = ["draft", "sent", "viewed", "accepted", "rejected", "expired"];

const statusOptions = STATUS_ORDER.map((v) => ({
  value: v,
  label: PROPOSAL_STATUS_LABEL[v],
  color: PROPOSAL_STATUS_COLOR[v],
}));

export default async function DocPropostaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data } = await supabase
    .from("proposals")
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
      type="p"
      initialTitle={data.title}
      initialContent={data.content_md ?? ""}
      initialStatus={data.status as ProposalStatus}
      viewerUrl={data.viewer_url ?? `https://app.campello.me/view/p/${data.id}`}
      statusOptions={statusOptions}
      apiPath="/api/proposals"
      breadcrumb={breadcrumb}
    />
  );
}
