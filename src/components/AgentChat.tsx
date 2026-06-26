"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useParams } from "next/navigation";
import { Send } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type EntityType = "contact" | "client" | "company" | "opportunity" | "proposal" | "contract" | "pipeline";

interface PageContext {
  pathname: string;
  route_label: string;
  entity_type?: EntityType;
  entity_id?: string;
}

// Mapa seção → rótulo + tipo de entidade (espelha as rotas em src/app/(app)).
const SECTION_MAP: Record<string, { label: string; type?: EntityType }> = {
  "":              { label: "Dashboard" },
  empresas:        { label: "Empresas", type: "company" },
  clientes:        { label: "Contatos", type: "contact" },
  oportunidades:   { label: "Oportunidades (pipeline)", type: "pipeline" },
  propostas:       { label: "Propostas", type: "proposal" },
  contratos:       { label: "Contratos", type: "contract" },
  operacao:        { label: "Operação", type: "client" },
  financeiro:      { label: "Financeiro" },
  agente:          { label: "Agente" },
  configuracoes:   { label: "Conectores" },
};

function derivePageContext(pathname: string, params: Record<string, string | string[]>): PageContext {
  const section = pathname.split("/").filter(Boolean)[0] ?? "";
  const m = SECTION_MAP[section] ?? { label: pathname };
  const id = typeof params?.id === "string" ? params.id : undefined;
  const ctx: PageContext = { pathname, route_label: m.label };
  if (m.type === "pipeline") {
    ctx.entity_type = "pipeline";
  } else if (id && m.type) {
    ctx.entity_type = m.type;
    ctx.entity_id = id;
  }
  return ctx;
}

export default function AgentChat({ initialMessages }: { initialMessages?: Message[] }) {
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [pending, setPending]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const router   = useRouter();
  const pathname = usePathname();
  const params   = useParams();

  // Hidrata o histórico quando montado sem mensagens iniciais (uso no dock).
  useEffect(() => {
    if (initialMessages !== undefined) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/agent/chat");
        const data = await res.json();
        if (active && Array.isArray(data.messages)) setMessages(data.messages);
      } catch {
        // abre vazio se falhar
      }
    })();
    return () => { active = false; };
  }, [initialMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(message: string, confirmAction?: "yes" | "no") {
    if (loading) return;
    setLoading(true);
    setPending(false);

    if (!confirmAction && message) {
      setMessages(prev => [...prev, { role: "user", content: message }]);
      setInput("");
    }

    try {
      const body: Record<string, unknown> = {
        channel: "web",
        page_context: derivePageContext(pathname, params as Record<string, string | string[]>),
      };
      if (message) body.message = message;
      if (confirmAction) body.confirm_action = confirmAction;

      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.response) {
        setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
        if (data.pending_confirmation) setPending(true);
        // Influência na tela: reflete escritas sem reload manual.
        if (data.navigate_to) router.push(data.navigate_to as string);
        else if (data.did_write) router.refresh();
      } else if (data.error) {
        setMessages(prev => [...prev, { role: "assistant", content: `Erro: ${data.error}` }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Não consegui conectar ao agente." }]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) send(input.trim());
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>

      {/* Mensagens */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 && !loading && (
          <p className="pda-empty" style={{ margin: "auto", textAlign: "center" }}>
            Olá! Pergunte sobre clientes, propostas ou tarefas — ou peça para registrar algo.
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "72%",
              padding: "10px 14px",
              borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: m.role === "user" ? "var(--pandora-violet-100)" : "var(--pandora-ink-50)",
              color: m.role === "user" ? "var(--pandora-violet-900)" : "var(--pandora-ink-700)",
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              border: m.role === "assistant" ? "1px solid var(--pandora-ink-100)" : "none",
            }}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{
              padding: "10px 18px",
              borderRadius: "16px 16px 16px 4px",
              background: "var(--pandora-ink-50)",
              border: "1px solid var(--pandora-ink-100)",
              color: "var(--pandora-violet-400)",
              fontSize: 20,
              letterSpacing: 3,
              fontFamily: "var(--font-mono)",
            }}>
              ···
            </div>
          </div>
        )}

        {pending && !loading && (
          <div style={{ display: "flex", gap: 8, paddingLeft: 2 }}>
            <button className="pda-btn" onClick={() => send("", "yes")}>
              ✅ Confirmar
            </button>
            <button className="pda-btn-ghost" onClick={() => send("", "no")}>
              ❌ Cancelar
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: "12px 20px 20px",
        borderTop: "1px solid var(--pandora-ink-100)",
        display: "flex",
        gap: 10,
        alignItems: "flex-end",
      }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte algo ou peça uma ação… (Enter envia, Shift+Enter nova linha)"
          rows={1}
          disabled={loading}
          style={{
            flex: 1,
            resize: "none",
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid var(--pandora-ink-200)",
            background: "var(--pandora-ink-0)",
            color: "var(--pandora-ink-700)",
            fontSize: 14,
            lineHeight: 1.5,
            outline: "none",
            maxHeight: 120,
            overflowY: "auto",
            fontFamily: "inherit",
          }}
        />
        <button
          className="pda-btn"
          onClick={() => input.trim() && send(input.trim())}
          disabled={loading || !input.trim()}
          style={{ height: 40, flexShrink: 0 }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
