// Layout de "modo foco": sem Sidebar nem AgentDock.
// Auth segue protegida pelo middleware (a rota não está em /login, /api, /view, /portal).
export default function FocusLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
