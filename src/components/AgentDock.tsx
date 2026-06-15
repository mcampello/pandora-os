"use client";

import { useEffect, useState } from "react";
import { Bot, PanelRightClose } from "lucide-react";
import AgentChat from "@/components/AgentChat";

const STORAGE_KEY = "pandora.agentDock.open";
export const TOGGLE_EVENT = "pandora:toggle-agent";

export default function AgentDock() {
  const [open, setOpen] = useState(false);
  // Evita renderizar o chat antes de hidratar (e evita flash do estado salvo).
  const [mounted, setMounted] = useState(false);

  // Init só no cliente: lê o estado salvo após montar (evita hydration mismatch).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMounted(true);
    try {
      setOpen(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* noop */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    } catch {
      /* noop */
    }
  }, [open, mounted]);

  // Sidebar (e qualquer outro ponto) abre/fecha via evento de janela.
  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener(TOGGLE_EVENT, toggle);
    return () => window.removeEventListener(TOGGLE_EVENT, toggle);
  }, []);

  // Antes de hidratar, mantém o trilho recolhido (sem flash do estado salvo).
  const isOpen = mounted && open;

  return (
    /* Coluna do dock — sempre ancorada à direita; largura anima entre trilho (56) e 400. */
    <aside className="pda-dock" data-open={isOpen ? "true" : "false"}>
      {/* Trilho recolhido: faixa fina com o ícone do agente */}
      <button
        type="button"
        className="pda-dock-rail"
        onClick={() => setOpen(true)}
        title="Abrir agente Pandora"
        aria-label="Abrir agente Pandora"
        aria-hidden={isOpen}
        tabIndex={isOpen ? -1 : 0}
      >
        <span className="pda-dock-rail-icon">
          <Bot size={20} />
        </span>
        <span className="pda-dock-rail-label">Pandora</span>
      </button>

      {/* Painel expandido: header + chat */}
      <div className="pda-dock-inner">
        <header className="pda-dock-header">
          <Bot size={15} strokeWidth={1.5} color="var(--pandora-violet-500)" />
          <span className="pda-dock-title">Pandora</span>
          <button
            type="button"
            className="pda-dock-close"
            onClick={() => setOpen(false)}
            title="Recolher agente"
            aria-label="Recolher agente"
          >
            <PanelRightClose size={16} />
          </button>
        </header>
        <div className="pda-dock-body">
          {/* Monta o chat só quando aberto (hidrata histórico ao abrir) */}
          {isOpen && <AgentChat />}
        </div>
      </div>
    </aside>
  );
}
