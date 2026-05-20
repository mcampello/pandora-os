import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import DocEditor from "@/components/DocEditor";
import { PROPOSAL_STATUS_LABEL, PROPOSAL_STATUS_COLOR } from "@/lib/docs";
import type { ProposalStatus } from "@/lib/types";

const STATUS_ORDER: ProposalStatus[] = ["draft", "sent", "viewed", "accepted", "rejected", "expired"];

const statusOptions = STATUS_ORDER.map((v) => ({
  value: v,
  label: PROPOSAL_STATUS_LABEL[v],
  color: PROPOSAL_STATUS_COLOR[v],
}));

export default async function PropostaEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data } = await supabase
    .from("proposals")
    .select("id, title, content_md, status, viewer_url")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  return (
    <DocEditor
      id={data.id}
      type="p"
      initialTitle={data.title}
      initialContent={data.content_md ?? ""}
      initialStatus={data.status as ProposalStatus}
      viewerUrl={data.viewer_url ?? `https://app.campello.me/view/p/${data.id}`}
      statusOptions={statusOptions}
      backHref="/propostas"
      backLabel="Propostas"
      apiPath="/api/proposals"
    />
  );
}
