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

export async function exportToDocx(markdown: string, title: string): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle } = await import("docx");

  const lines = markdown.split("\n");
  const children: unknown[] = [];

  for (const line of lines) {
    const h1 = line.match(/^# (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    const hr = line.match(/^---+$/);
    const li = line.match(/^[-*] (.+)/);
    const text = line
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`(.+?)`/g, "$1");

    if (h1) {
      children.push(new Paragraph({ text: h1[1], heading: HeadingLevel.HEADING_1, spacing: { after: 200 } }));
    } else if (h2) {
      children.push(new Paragraph({ text: h2[1], heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 120 } }));
    } else if (h3) {
      children.push(new Paragraph({ text: h3[1], heading: HeadingLevel.HEADING_3, spacing: { before: 240, after: 80 } }));
    } else if (hr) {
      children.push(new Paragraph({ text: "", border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } } }));
    } else if (li) {
      children.push(new Paragraph({ text: li[1], bullet: { level: 0 }, spacing: { after: 80 } }));
    } else if (text.trim()) {
      children.push(new Paragraph({ children: [new TextRun({ text })], spacing: { after: 120 } }));
    } else {
      children.push(new Paragraph({ text: "" }));
    }
  }

  const doc = new Document({
    sections: [{ children: children as InstanceType<typeof Paragraph>[] }],
    creator: "Pandora OS",
    title,
  });

  const blob = await Packer.toBlob(doc);
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
