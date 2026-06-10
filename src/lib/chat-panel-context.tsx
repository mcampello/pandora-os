"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { usePathname } from "next/navigation";

interface ChatPanelContact {
  contactId: string;
  contactPhone: string;
  contactName: string;
}

interface ChatPanelState {
  open: boolean;
  contact: ChatPanelContact | null;
  openedOnPath: string | null;
}

interface ChatPanelContextValue {
  panelOpen: boolean;
  panelContact: ChatPanelContact | null;
  openPanel: (contact: ChatPanelContact) => void;
  closePanel: () => void;
}

const ChatPanelContext = createContext<ChatPanelContextValue | null>(null);

export function ChatPanelProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<ChatPanelState>({ open: false, contact: null, openedOnPath: null });

  useEffect(() => {
    if (state.open && state.openedOnPath && pathname !== state.openedOnPath) {
      setState(prev => ({ ...prev, open: false }));
    }
  }, [pathname, state.open, state.openedOnPath]);

  function openPanel(contact: ChatPanelContact) {
    setState({ open: true, contact, openedOnPath: pathname });
  }

  function closePanel() {
    setState(prev => ({ ...prev, open: false }));
  }

  return (
    <ChatPanelContext.Provider
      value={{
        panelOpen: state.open,
        panelContact: state.contact,
        openPanel,
        closePanel,
      }}
    >
      {children}
    </ChatPanelContext.Provider>
  );
}

export function useChatPanel() {
  const ctx = useContext(ChatPanelContext);
  if (!ctx) throw new Error("useChatPanel must be used inside ChatPanelProvider");
  return ctx;
}
