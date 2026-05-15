"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NovoContatoPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", company: "", role: "",
    linkedin_url: "", website: "", source: "manual", notes: "",
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v.trim() || null])
    );
    const { data, error } = await supabase.from("contacts").insert(payload).select("id").single();
    setSaving(false);
    if (error) { alert(error.message); return; }
    router.push(`/clientes/${data.id}`);
  }

  return (
    <>
      <header className="pda-topbar">
        <div className="pda-topbar-left">
          <Link href="/clientes" className="pda-icon-btn"><ArrowLeft size={16} /></Link>
          <h1 className="pda-topbar-title">Novo contato</h1>
        </div>
      </header>

      <div className="pda-content">
        <form onSubmit={save} style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Nome *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required autoFocus />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Email"    value={form.email}   onChange={(v) => setForm({ ...form, email: v })}   type="email" />
            <Field label="Telefone" value={form.phone}   onChange={(v) => setForm({ ...form, phone: v })}   placeholder="+55 11 99999-9999" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Empresa" value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
            <Field label="Cargo"   value={form.role}    onChange={(v) => setForm({ ...form, role: v })} />
          </div>

          <Field label="LinkedIn" value={form.linkedin_url} onChange={(v) => setForm({ ...form, linkedin_url: v })} placeholder="https://linkedin.com/in/..." />
          <Field label="Site"     value={form.website}      onChange={(v) => setForm({ ...form, website: v })}      placeholder="https://..." />

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Origem</label>
            <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} style={inputStyle}>
              <option value="manual">Manual</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="indication">Indicação</option>
              <option value="fathom">Reunião (Fathom)</option>
              <option value="calcom">Agendamento (Cal.com)</option>
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Notas</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={4}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-text)" }}
              placeholder="Como conheceu, contexto, primeira interação…"
            />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button type="submit" className="pda-btn" disabled={saving || !form.name.trim()}>
              {saving ? "Salvando…" : "Criar contato"}
            </button>
            <Link href="/clientes" className="pda-btn pda-btn-ghost">Cancelar</Link>
          </div>
        </form>
      </div>
    </>
  );
}

function Field({ label, value, onChange, required, autoFocus, type, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  required?: boolean; autoFocus?: boolean; type?: string; placeholder?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: "var(--pandora-ink-500)",
  fontFamily: "var(--font-display)",
  letterSpacing: "0.06em", textTransform: "uppercase",
};

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--pandora-ink-100)",
  borderRadius: "var(--radius-sm)",
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: "var(--font-text)",
  outline: "none",
  color: "var(--pandora-violet-900)",
  background: "#fff",
};
