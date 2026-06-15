"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import WhatsAppChatPanel from "@/components/WhatsAppChatPanel";
import AgentDock from "@/components/AgentDock";
import { ChatPanelProvider } from "@/lib/chat-panel-context";

export default function AppShell({ children }: { children: React.ReactNode }) {
  // A área autenticada é renderizada só no cliente (após montar). Motivo: extensões
  // de navegador (ex. Dashlane) injetam atributos data-* em todo input/button/textarea
  // antes do React hidratar, o que dispara erros de hydration mismatch impossíveis de
  // suprimir elemento a elemento. Sem HTML do servidor para o shell, não há comparação
  // de hidratação — e o app é autenticado (sem necessidade de SSR/SEO).
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    // Loader mínimo: um único elemento controlado (suppressHydrationWarning cobre
    // qualquer atributo que a extensão injete nele). SSR e 1º render batem.
    return <div className="pda-shell-boot" suppressHydrationWarning />;
  }

  return (
    <ChatPanelProvider>
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        <Sidebar />
        <div className="pda-main">{children}</div>
        <AgentDock />
        <WhatsAppChatPanel />
      </div>
    </ChatPanelProvider>
  );
}
