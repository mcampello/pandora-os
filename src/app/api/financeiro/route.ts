import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: contracts, error } = await supabase
    .from("contracts")
    .select("*, company:companies(id,name,cnpj), client:clients(id,company_name,status,monthly_fee)")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!contracts || contracts.length === 0) return NextResponse.json([]);

  const contractIds = contracts.map((c) => c.id);

  const { data: invoices } = await supabase
    .from("invoices")
    .select("contract_id, status, amount")
    .in("contract_id", contractIds);

  const invoicesByContract: Record<string, { pending: number; total: number }> = {};
  for (const inv of invoices ?? []) {
    if (!invoicesByContract[inv.contract_id]) {
      invoicesByContract[inv.contract_id] = { pending: 0, total: 0 };
    }
    invoicesByContract[inv.contract_id].total += Number(inv.amount);
    if (inv.status === "pendente" || inv.status === "emitida") {
      invoicesByContract[inv.contract_id].pending += 1;
    }
  }

  const result = contracts.map((c) => ({
    ...c,
    pending_invoices: invoicesByContract[c.id]?.pending ?? 0,
    total_invoiced: invoicesByContract[c.id]?.total ?? 0,
  }));

  return NextResponse.json(result);
}
