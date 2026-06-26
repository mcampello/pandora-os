import Sidebar from "@/components/Sidebar";
import AgentDock from "@/components/AgentDock";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar />
      <div className="pda-main">{children}</div>
      <AgentDock />
    </div>
  );
}
