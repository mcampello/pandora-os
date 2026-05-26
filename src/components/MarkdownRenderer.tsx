"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import MermaidDiagram from "./MermaidDiagram";

const components: Components = {
  pre({ children }) {
    const kids = React.Children.toArray(children);
    const codeEl = kids.find(
      (c): c is React.ReactElement =>
        React.isValidElement(c) &&
        typeof (c.props as { className?: string }).className === "string" &&
        (c.props as { className?: string }).className!.includes("language-mermaid"),
    );
    if (codeEl) {
      const raw = String((codeEl.props as { children: unknown }).children ?? "").replace(/\n$/, "");
      return <MermaidDiagram code={raw} />;
    }
    return <pre>{children}</pre>;
  },
};

interface Props {
  children: string;
  className?: string;
}

export default function MarkdownRenderer({ children, className }: Props) {
  const content = (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
  return className ? <div className={className}>{content}</div> : <>{content}</>;
}
