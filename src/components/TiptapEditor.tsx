"use client";

import { useEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "tiptap-markdown";
import { unescapeDocTokens } from "@/lib/docs";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered, Quote,
  Code, Link2, Minus, Undo2, Redo2, Table as TableIcon,
} from "lucide-react";

interface Props {
  /** Markdown inicial — usado apenas na montagem do editor. */
  initialMarkdown: string;
  /** Markdown "externo" atual (IA/Reverter). Quando difere do conteúdo do editor, é re-sincronizado. */
  markdown: string;
  /** Emite o markdown serializado a cada edição local. */
  onChange: (md: string) => void;
  /** Conteúdo renderizado acima do editor, dentro da coluna centralizada (ex.: título). */
  header?: React.ReactNode;
}

function TbBtn({
  onClick, active, disabled, title, children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`dn-tb-btn${active ? " active" : ""}`}
      onMouseDown={(e) => e.preventDefault()} // mantém a seleção no editor
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function getMd(editor: Editor): string {
  const storage = editor.storage as { markdown?: { getMarkdown?: () => string } };
  return unescapeDocTokens(storage.markdown?.getMarkdown?.() ?? "");
}

export default function TiptapEditor({ initialMarkdown, markdown, onChange, header }: Props) {
  const editor = useEditor({
    immediatelyRender: false, // obrigatório no Next/SSR
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noreferrer" } },
      }),
      Placeholder.configure({ placeholder: "Comece a escrever…" }),
      TableKit.configure({ table: { resizable: true } }),
      Markdown.configure({
        html: false,
        tightLists: true,
        transformPastedText: true,
        breaks: false,
      }),
    ],
    content: initialMarkdown,
    editorProps: {
      attributes: { class: "dn-prose", spellcheck: "false" },
    },
    onUpdate: ({ editor }) => onChange(getMd(editor)),
  });

  // Sincroniza markdown externo (IA aplica / Reverter) sem disparar onUpdate (evita loop).
  useEffect(() => {
    if (!editor) return;
    if (markdown !== getMd(editor)) {
      editor.commands.setContent(markdown, { emitUpdate: false });
    }
  }, [markdown, editor]);

  if (!editor) return <div className="dn-editor-skeleton" />;

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL do link:", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <>
      <div className="dn-toolbar" role="toolbar" aria-label="Formatação">
        <TbBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Negrito (Ctrl+B)"><Bold size={15} /></TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Itálico (Ctrl+I)"><Italic size={15} /></TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Sublinhado (Ctrl+U)"><UnderlineIcon size={15} /></TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Tachado"><Strikethrough size={15} /></TbBtn>
        <span className="dn-tb-sep" />
        <TbBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Título 1"><Heading1 size={15} /></TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Título 2"><Heading2 size={15} /></TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Título 3"><Heading3 size={15} /></TbBtn>
        <span className="dn-tb-sep" />
        <TbBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Lista"><List size={15} /></TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Lista numerada"><ListOrdered size={15} /></TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Citação"><Quote size={15} /></TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")} title="Bloco de código"><Code size={15} /></TbBtn>
        <span className="dn-tb-sep" />
        <TbBtn onClick={setLink} active={editor.isActive("link")} title="Link"><Link2 size={15} /></TbBtn>
        <TbBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divisória"><Minus size={15} /></TbBtn>
        <TbBtn onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Tabela"><TableIcon size={15} /></TbBtn>
        <span className="dn-tb-sep" />
        <TbBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Desfazer (Ctrl+Z)"><Undo2 size={15} /></TbBtn>
        <TbBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Refazer"><Redo2 size={15} /></TbBtn>
      </div>

      <BubbleMenu editor={editor} className="dn-bubble">
        <TbBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Negrito"><Bold size={14} /></TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Itálico"><Italic size={14} /></TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Sublinhado"><UnderlineIcon size={14} /></TbBtn>
        <TbBtn onClick={setLink} active={editor.isActive("link")} title="Link"><Link2 size={14} /></TbBtn>
      </BubbleMenu>

      <div className="dn-editor-scroll">
        <div className="dn-doc">
          {header}
          <EditorContent editor={editor} />
        </div>
      </div>
    </>
  );
}
