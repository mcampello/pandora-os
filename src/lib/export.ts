export async function exportToPdf(element: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.92);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height * pageW) / canvas.width;
  let yPos = 0;

  while (yPos < imgH) {
    if (yPos > 0) pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, -yPos, pageW, imgH);
    yPos += pageH;
  }

  pdf.save(`${filename}.pdf`);
}

// Strip embedded HTML from markdown, normalising to clean markdown
function stripEmbeddedHtml(md: string): string {
  return md
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, c) =>
      `- ${c.replace(/<[^>]+>/g, "").replace(/\*\*(.+?)\*\*/g, "$1").trim()}\n`,
    )
    .replace(/<br\s*\/?>/gi, "  \n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Escape HTML entities in plain text
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Convert inline markdown (bold, italic, code) to HTML
function inlineToHtml(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

// Convert clean markdown to HTML
function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inUl = false;
  let inTable = false;
  let tableStarted = false;

  const closeUl = () => { if (inUl) { out.push("</ul>"); inUl = false; } };
  const closeTable = () => {
    if (inTable) { out.push("</tbody></table>"); inTable = false; tableStarted = false; }
  };

  for (const line of lines) {
    const h1 = line.match(/^# (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    const hr = line.match(/^-{3,}$/);
    const li = line.match(/^\s*[-*] (.+)/);
    const tableRow = line.match(/^\|(.+)\|$/);
    const tableSep = /^\|[\s\-:|]+\|$/.test(line);

    if (tableSep) {
      /* skip separator row — already consumed as header boundary */
    } else if (tableRow) {
      closeUl();
      const cells = tableRow[1].split("|").map(c => c.trim());
      if (!inTable) {
        inTable = true;
        tableStarted = true;
        out.push(`<table><thead><tr>${cells.map(c => `<th>${inlineToHtml(c)}</th>`).join("")}</tr></thead><tbody>`);
      } else {
        out.push(`<tr>${cells.map(c => `<td>${inlineToHtml(c)}</td>`).join("")}</tr>`);
      }
    } else if (h1) {
      closeUl(); closeTable();
      out.push(`<h1>${inlineToHtml(h1[1])}</h1>`);
    } else if (h2) {
      closeUl(); closeTable();
      out.push(`<h2>${inlineToHtml(h2[1])}</h2>`);
    } else if (h3) {
      closeUl(); closeTable();
      out.push(`<h3>${inlineToHtml(h3[1])}</h3>`);
    } else if (hr) {
      closeUl(); closeTable();
      out.push(`<hr/>`);
    } else if (li) {
      closeTable();
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push(`<li>${inlineToHtml(li[1])}</li>`);
    } else if (line.trim()) {
      closeUl(); closeTable();
      out.push(`<p>${inlineToHtml(line)}</p>`);
    } else {
      closeUl(); closeTable();
    }
  }
  closeUl();
  closeTable();
  return out.join("\n");
}

export async function exportToDocx(markdown: string, title: string): Promise<void> {
  const htmlDocx = await import("html-docx-js/dist/html-docx");
  const asBlob = htmlDocx.asBlob;

  const clean = stripEmbeddedHtml(markdown);
  const bodyHtml = mdToHtml(clean);

  const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body   { font-family: Arial, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.6; margin: 2cm; }
  h1     { font-size: 18pt; font-weight: bold; margin: 24pt 0 8pt; }
  h2     { font-size: 14pt; font-weight: bold; margin: 18pt 0 6pt; }
  h3     { font-size: 12pt; font-weight: bold; margin: 12pt 0 4pt; }
  p      { margin: 0 0 8pt; }
  ul     { margin: 0 0 8pt; padding-left: 20pt; }
  li     { margin-bottom: 4pt; }
  strong { font-weight: bold; }
  em     { font-style: italic; }
  hr     { border: none; border-top: 1px solid #ccc; margin: 12pt 0; }
  table  { border-collapse: collapse; width: 100%; margin: 8pt 0; }
  th, td { border: 1px solid #ccc; padding: 4pt 8pt; text-align: left; }
  th     { background: #f0f0f0; font-weight: bold; }
  code   { font-family: "Courier New", monospace; font-size: 10pt; }
</style></head><body>${bodyHtml}</body></html>`;

  const blob = asBlob(fullHtml);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function safeFilename(title: string): string {
  return title.replace(/[^a-z0-9]/gi, "-").toLowerCase();
}
