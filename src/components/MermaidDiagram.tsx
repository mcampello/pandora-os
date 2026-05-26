"use client";

import { useEffect, useRef, useState } from "react";

let mermaidReady = false;

async function ensureMermaid() {
  if (mermaidReady) return;
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    themeVariables: {
      // Pandora design system tokens
      primaryColor: "#E7D0FF",          // violet-100
      primaryTextColor: "#22003E",      // violet-900
      primaryBorderColor: "#7A1CB5",   // violet-600
      lineColor: "#857891",             // ink-400
      secondaryColor: "#d4f5ec",        // green tint
      tertiaryColor: "#F5EAFF",         // violet-50
      background: "#FFFFFF",
      mainBkg: "#F5EAFF",
      nodeBorder: "#7A1CB5",
      clusterBkg: "#F5EAFF",
      clusterBorder: "#D1A8FF",         // violet-200
      titleColor: "#22003E",
      edgeLabelBackground: "#FFFFFF",
      fontFamily: '"Sora", system-ui, sans-serif',
      fontSize: "13px",
      // Gantt
      taskBkgColor: "#E7D0FF",
      taskBorderColor: "#7A1CB5",
      taskTextColor: "#22003E",
      taskTextOutsideColor: "#3E3446",
      taskTextLightColor: "#F5EAFF",
      activeTaskBkgColor: "#7A1CB5",
      activeTaskBorderColor: "#5A1288",
      gridColor: "#EBE4F2",
      doneTaskBkgColor: "#2DD4A0",
      doneTaskBorderColor: "#0F7F58",
      critBkgColor: "#FFE27A",
      critBorderColor: "#F5A623",
      todayLineColor: "#2DD4A0",
      sectionBkgColor: "#F5EAFF",
      altSectionBkgColor: "#FAF6FF",
      sectionBkgColor2: "#E7D0FF",
    },
  });
  mermaidReady = true;
}

let counter = 0;

export default function MermaidDiagram({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useRef(`pda-mermaid-${++counter}`);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    async function render() {
      try {
        await ensureMermaid();
        const { default: mermaid } = await import("mermaid");
        const { svg } = await mermaid.render(id.current, code);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao renderizar diagrama");
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <div className="pda-mermaid-error">
        <span className="pda-mermaid-error-label">Diagrama inválido</span>
        <pre className="pda-mermaid-error-code">{code}</pre>
      </div>
    );
  }

  return <div className="pda-mermaid-wrap" ref={containerRef} />;
}
