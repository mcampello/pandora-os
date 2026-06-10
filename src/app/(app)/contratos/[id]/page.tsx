import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import DocEditor from "@/components/DocEditor";
import { CONTRACT_STATUS_LABEL, CONTRACT_STATUS_COLOR } from "@/lib/docs";
import type { ContractStatus } from "@/lib/types";

const STATUS_ORDER: ContractStatus[] = ["draft", "in_review", "signed", "active", "ended", "cancelled"];

const statusOptions = STATUS_ORDER.map((v) => ({
  value: v,
  label: CONTRACT_STATUS_LABEL[v],
  color: CONTRACT_STATUS_COLOR[v],
}));

export default async function ContratoEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data } = await supabase
    .from("contracts")
    .select("id, title, content_md, status, viewer_url")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  return (
    <DocEditor
      id={data.id}
      type="c"
      initialTitle={data.title}
      initialContent={data.content_md ?? ""}
      initialStatus={data.status as ContractStatus}
      viewerUrl={data.viewer_url ?? `https://app.campello.me/view/c/${data.id}`}
      statusOptions={statusOptions}
      backHref="/contratos"
      backLabel="Contratos"
      apiPath="/api/contracts"
      duplicateHref={`/contratos/novo?source=${data.id}&mode=duplicate`}
    />
  );
}
