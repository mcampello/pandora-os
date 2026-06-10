"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Zap, ClipboardList, MoreHorizontal,
  X, Building2, FileText, ScrollText, Wallet, Settings,
} from "lucide-react";
import { useState } from "react";
import { clsx } from "clsx";

const mainItems = [
  { href: "/",              label: "Home",      icon: LayoutDashboard, exact: true },
  { href: "/clientes",      label: "Contatos",  icon: Users },
  { href: "/oportunidades", label: "Opport.",   icon: Zap },
  { href: "/operacao",      label: "Clientes",  icon: ClipboardList },
];

const moreItems = [
  { href: "/empresas",                 label: "Empresas",   icon: Building2 },
  { href: "/propostas",                label: "Propostas",  icon: FileText },
  { href: "/contratos",                label: "Contratos",  icon: ScrollText },
  { href: "/financeiro",               label: "Financeiro", icon: Wallet },
  { href: "/configuracoes/conectores", label: "Conectores", icon: Settings },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  function isActive(href: string, exact = false) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  return (
    <>
      {moreOpen && (
        <div className="pda-bottom-overlay" onClick={() => setMoreOpen(false)} />
      )}

      {moreOpen && (
        <div className="pda-bottom-more">
          <div className="pda-bottom-more-header">
            <span>Menu</span>
            <button type="button" onClick={() => setMoreOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <div className="pda-bottom-more-grid">
            {moreItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={clsx("pda-bottom-more-item", pathname.startsWith(href) && "active")}
                onClick={() => setMoreOpen(false)}
              >
                <Icon size={20} />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <nav className="pda-bottom-nav">
        {mainItems.map(({ href, label, icon: Icon, exact }) => (
          <Link
            key={href}
            href={href}
            className={clsx("pda-bottom-nav-item", isActive(href, exact) && "active")}
          >
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        ))}
        <button
          type="button"
          className={clsx("pda-bottom-nav-item", moreOpen && "active")}
          onClick={() => setMoreOpen(!moreOpen)}
        >
          <MoreHorizontal size={20} />
          <span>Mais</span>
        </button>
      </nav>
    </>
  );
}
