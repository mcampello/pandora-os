import type { CSSProperties, ReactNode } from "react";

interface FilterChipProps {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: ReactNode;
}

export function FilterChip({ active, color, onClick, children }: FilterChipProps) {
  const c = color ?? "var(--pandora-violet-600)";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 12px",
        borderRadius: 99,
        fontSize: 12,
        cursor: "pointer",
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        border: `1.5px solid ${active ? c : "var(--pandora-ink-100)"}`,
        background: active ? c : "transparent",
        color: active ? "#fff" : "var(--pandora-ink-500)",
      }}
    >
      {children}
    </button>
  );
}

interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}

export function Field({ label, children, style }: FieldProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      {typeof label === "string" ? (
        <label
          style={{
            fontSize: 11,
            color: "var(--pandora-ink-500)",
            fontFamily: "var(--font-display)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </label>
      ) : (
        label
      )}
      {children}
    </div>
  );
}
