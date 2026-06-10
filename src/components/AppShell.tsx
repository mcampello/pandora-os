"use client";

import Sidebar from "@/components/Sidebar";
import WhatsAppChatPanel from "@/components/WhatsAppChatPanel";
import { ChatPanelProvider } from "@/lib/chat-panel-context";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ChatPanelProvider>
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        <Sidebar />
        <div className="pda-main">{children}</div>
        <WhatsAppChatPanel />
      </div>
    </ChatPanelProvider>
  );
}
