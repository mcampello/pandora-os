"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("Email ou senha incorretos");
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--pandora-violet-950)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <Image src="/pandora_ico.svg" alt="Pandora" width={56} height={56} />
          <h1 style={{
            fontFamily: "var(--font-display)",
            fontSize: 22, fontWeight: 600,
            color: "#fff", margin: 0,
            letterSpacing: "-0.005em",
          }}>
            Pandora OS
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0 }}>
            Sistema operacional da Pandora Tech
          </p>
        </div>

        <form onSubmit={onSubmit} style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "var(--radius-lg)",
          padding: 24,
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontFamily: "var(--font-display)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontFamily: "var(--font-display)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{
              padding: "8px 12px",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "var(--radius-sm)",
              fontSize: 12,
              color: "#FCA5A5",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="pda-btn"
            style={{ justifyContent: "center", padding: "10px 16px", marginTop: 4 }}
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "var(--radius-sm)",
  padding: "10px 12px",
  fontSize: 14,
  color: "#fff",
  fontFamily: "var(--font-text)",
  outline: "none",
};
