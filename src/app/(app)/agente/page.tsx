import { Bot } from "lucide-react";
import { supabaseServer } from "@/lib/supabase-server";
import AgentChat from "@/components/AgentChat";

export default async function AgentePage() {
  let initialMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("agent_messages")
        .select("role, content")
        .eq("channel", "web")
        .order("created_at", { ascending: false })
        .limit(30);
      initialMessages = ((data ?? []).reverse()) as typeof initialMessages;
    }
  } catch {
    // degrade gracefully — chat abre vazio
  }

  return (
    <>
      <header className="pda-topbar">
        <div className="pda-topbar-left">
          <Bot size={15} strokeWidth={1.5} color="var(--pandora-violet-500)" />
          <h1 className="pda-topbar-title">Agente</h1>
          <span className="pda-chip">Pandora</span>
        </div>
      </header>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
        <AgentChat initialMessages={initialMessages} />
      </div>
    </>
  );
}
