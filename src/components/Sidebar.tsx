"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, Users, Zap, FileText, ScrollText,
  ClipboardList, Wallet, Settings, ChevronLeft, ChevronRight,
  ChevronDown, LogOut, CheckSquare, Bot,
} from "lucide-react";
import { clsx } from "clsx";
import { supabaseBrowser } from "@/lib/supabase-browser";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "CRM",
    items: [
      { href: "/empresas",      label: "Empresas",      icon: Building2 },
      { href: "/clientes",      label: "Contatos",      icon: Users },
      { href: "/oportunidades", label: "Oportunidades", icon: Zap },
    ],
  },
  {
    label: "Comercial",
    items: [
      { href: "/propostas",  label: "Propostas", icon: FileText },
      { href: "/contratos",  label: "Contratos", icon: ScrollText },
    ],
  },
  {
    label: "Operação",
    items: [
      { href: "/operacao",   label: "Operação",   icon: ClipboardList },
      { href: "/financeiro", label: "Financeiro", icon: Wallet },
    ],
  },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(true);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    CRM: true, Comercial: true, Operação: true,
  });
  const pathname = usePathname();
  const router = useRouter();

  // Collapse on every navigation
  useEffect(() => {
    setCollapsed(true);
  }, [pathname]);

  function toggleGroup(label: string) {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
  }

  async function logout() {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className={clsx("pda-side", collapsed && "collapsed")}>
      <div className="pda-brand">
        <Image
          src="/pandora_ico.svg"
          alt="Pandora"
          width={collapsed ? 32 : 28}
          height={collapsed ? 32 : 28}
          className="pda-brand-logo"
          priority
          unoptimized
        />
        <span className="pda-brand-label">Pandora OS</span>
        <button
          type="button"
          className="pda-collapse-btn pda-collapse-toggle"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <ul className="pda-nav" style={{ marginTop: 8 }}>
        <li>
          <Link
            href="/agente"
            className={clsx("pda-nav-item", pathname.startsWith("/agente") && "active")}
            title={collapsed ? "Agente" : undefined}
          >
            <Bot size={16} />
            <span className="pda-nav-label">Agente</span>
          </Link>
        </li>
        <li>
          <Link
            href="/"
            className={clsx("pda-nav-item", pathname === "/" && "active")}
            title={collapsed ? "Dashboard" : undefined}
          >
            <LayoutDashboard size={16} />
            <span className="pda-nav-label">Dashboard</span>
          </Link>
        </li>
        <li>
          <Link
            href="/tarefas"
            className={clsx("pda-nav-item", pathname.startsWith("/tarefas") && "active")}
            title={collapsed ? "Tarefas" : undefined}
          >
            <CheckSquare size={16} />
            <span className="pda-nav-label">Tarefas</span>
          </Link>
        </li>
      </ul>

      {navGroups.map(group => {
        const isOpen = openGroups[group.label] ?? true;
        const hasActive = group.items.some(i => pathname.startsWith(i.href));

        return (
          <div key={group.label}>
            {!collapsed && (
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className="pda-nav-section"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", cursor: "pointer",
                  background: "none", border: "none", padding: "0 16px",
                }}
                title={group.label}
              >
                <span>{group.label}</span>
                <ChevronDown
                  size={12}
                  style={{
                    transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                    transition: "transform 150ms",
                    opacity: 0.5,
                  }}
                />
              </button>
            )}

            {(isOpen || collapsed) && (
              <ul className="pda-nav">
                {group.items.map(({ href, label, icon: Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className={clsx("pda-nav-item", pathname.startsWith(href) && "active")}
                      title={collapsed ? label : undefined}
                    >
                      <Icon size={16} />
                      <span className="pda-nav-label">{label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

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
            type="button"
            onClick={logout}
            className="pda-collapse-btn pda-foot-logout"
            title="Sair"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
