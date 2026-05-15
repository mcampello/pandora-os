"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Zap, FileText, ScrollText, Wallet, Settings,
  ChevronLeft, ChevronRight, LogOut,
} from "lucide-react";
import { clsx } from "clsx";
import { supabaseBrowser } from "@/lib/supabase-browser";

const navItems = [
  { href: "/",              label: "Dashboard",     icon: LayoutDashboard },
  { href: "/clientes",      label: "Contatos",      icon: Users },
  { href: "/oportunidades", label: "Oportunidades", icon: Zap },
  { href: "/propostas",     label: "Propostas",     icon: FileText },
  { href: "/contratos",     label: "Contratos",     icon: ScrollText },
  { href: "/financeiro",    label: "Financeiro",    icon: Wallet },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router   = useRouter();

  async function logout() {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className={clsx("pda-side", collapsed && "collapsed")}>
      <div className="pda-brand">
        <Image src="/pandora_ico.svg" alt="Pandora" width={28} height={28} />
        <span className="pda-brand-label">Pandora OS</span>
        <button className="pda-collapse-btn" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <div className="pda-nav-section">Menu</div>
      <ul className="pda-nav">
        {navItems.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={clsx("pda-nav-item", pathname === href && "active")}
              title={collapsed ? label : undefined}
            >
              <Icon size={16} />
              <span className="pda-nav-label">{label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div style={{ marginTop: "auto" }}>
        <div className="pda-nav-section">Sistema</div>
        <ul className="pda-nav">
          <li>
            <Link
              href="/configuracoes/conectores"
              className={clsx("pda-nav-item", pathname.startsWith("/configuracoes") && "active")}
              title={collapsed ? "Conectores" : undefined}
            >
              <Settings size={16} />
              <span className="pda-nav-label">Conectores</span>
            </Link>
          </li>
        </ul>
        <div className="pda-foot">
          <div className="pda-avatar">MC</div>
          <div className="pda-me">
            <div className="pda-me-name">Mario Campello</div>
            <div className="pda-me-role">Pandora Tech</div>
          </div>
          <button
            onClick={logout}
            className="pda-collapse-btn"
            title="Sair"
            style={{ marginLeft: "auto" }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
