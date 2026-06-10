"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Check, Loader2, AlertCircle } from "lucide-react";

interface CompanyForm {
  name: string;
  cnpj: string;
  website: string;
  address_zip: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_city: string;
  address_state: string;
}

const EMPTY: CompanyForm = {
  name: "", cnpj: "", website: "",
  address_zip: "", address_street: "", address_number: "",
  address_complement: "", address_city: "", address_state: "",
};

export default function CadastroPage() {
  const { token } = useParams<{ token: string }>();
  const [form, setForm] = useState<CompanyForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/cadastro/${token}`);
    if (!res.ok) { setNotFound(true); setLoading(false); return; }
    const data = await res.json();
    setForm({
      name: data.name ?? "",
      cnpj: data.cnpj ?? "",
      website: data.website ?? "",
      address_zip: data.address_zip ?? "",
      address_street: data.address_street ?? "",
      address_number: data.address_number ?? "",
      address_complement: data.address_complement ?? "",
      address_city: data.address_city ?? "",
      address_state: data.address_state ?? "",
    });
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    const res = await fetch(`/api/cadastro/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setStatus("success");
    } else {
      const body = await res.json();
      setErrorMsg(body.error ?? "Erro ao salvar. Tente novamente.");
      setStatus("error");
    }
  }

  const set = (k: keyof CompanyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  if (loading) {
    return (
      <Screen>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite", color: "#7A1CB5" }} />
      </Screen>
    );
  }

  if (notFound) {
    return (
      <Screen>
        <div style={{ textAlign: "center" }}>
          <AlertCircle size={40} style={{ color: "#ef4444", marginBottom: 16 }} />
          <h2 style={{ margin: "0 0 8px", fontFamily: "'Chakra Petch', sans-serif", fontSize: 22 }}>Link inválido</h2>
          <p style={{ color: "#6b7280", fontSize: 15 }}>Este link não existe ou expirou. Entre em contato com a Pandora Tech.</p>
        </div>
      </Screen>
    );
  }

  if (status === "success") {
    return (
      <Screen>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(45,212,160,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <Check size={32} style={{ color: "#2DD4A0" }} />
          </div>
          <h2 style={{ margin: "0 0 8px", fontFamily: "'Chakra Petch', sans-serif", fontSize: 22 }}>Dados enviados!</h2>
          <p style={{ color: "#6b7280", fontSize: 15 }}>Obrigado. Suas informações foram salvas com sucesso.</p>
        </div>
      </Screen>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0D0219", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "20px 32px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: "linear-gradient(135deg, #7A1CB5, #2DD4A0)", flexShrink: 0 }} />
          <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 16, color: "#fff" }}>Pandora Tech</span>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 16px" }}>
        <div style={{ width: "100%", maxWidth: 560 }}>
          <h1 style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 24, fontWeight: 700, color: "#fff", margin: "0 0 6px" }}>
            Cadastro da Empresa
          </h1>
          <p style={{ color: "#9ca3af", fontSize: 15, margin: "0 0 32px" }}>
            Preencha os dados da sua empresa para que possamos emitir as notas fiscais corretamente.
          </p>

          <form onSubmit={submit}>
            <Section label="Dados da Empresa">
              <Field label="Razão Social *" value={form.name} onChange={set("name")} required placeholder="Nome completo da empresa" />
              <Row2>
                <Field label="CNPJ *" value={form.cnpj} onChange={set("cnpj")} required placeholder="00.000.000/0001-00" />
                <Field label="Website" value={form.website} onChange={set("website")} placeholder="https://..." />
              </Row2>
            </Section>

            <Section label="Endereço">
              <Row2>
                <Field label="CEP *" value={form.address_zip} onChange={set("address_zip")} required placeholder="00000-000" />
                <div />
              </Row2>
              <Row2>
                <Field label="Rua *" value={form.address_street} onChange={set("address_street")} required placeholder="Nome da rua" />
                <Field label="Número *" value={form.address_number} onChange={set("address_number")} required placeholder="123" />
              </Row2>
              <Field label="Complemento" value={form.address_complement} onChange={set("address_complement")} placeholder="Apto, sala, andar..." />
              <Row2>
                <Field label="Cidade *" value={form.address_city} onChange={set("address_city")} required placeholder="São Paulo" />
                <Field label="Estado *" value={form.address_state} onChange={set("address_state")} required placeholder="SP" maxLength={2} />
              </Row2>
            </Section>

            {status === "error" && (
              <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 20, color: "#ef4444", fontSize: 13 }}>
                {errorMsg}
              </div>
            )}

            <button type="submit" disabled={saving}
              style={{ width: "100%", padding: "13px 24px", borderRadius: 10, border: "none", cursor: saving ? "not-allowed" : "pointer", background: "linear-gradient(135deg, #7A1CB5, #2DD4A0)", color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "'Chakra Petch', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: saving ? 0.7 : 1 }}>
              {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={16} />}
              {saving ? "Enviando..." : "Enviar dados"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0D0219", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "'Chakra Petch', sans-serif", color: "#7A1CB5", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </div>
  );
}

function Row2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{children}</div>;
}

function Field({ label, value, onChange, required, placeholder, maxLength }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean; placeholder?: string; maxLength?: number;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>{label}</label>
      <input
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 14, boxSizing: "border-box", outline: "none" }}
        onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#7A1CB5"; }}
        onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.12)"; }}
      />
    </div>
  );
}
