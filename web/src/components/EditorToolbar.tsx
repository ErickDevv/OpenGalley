import { Project } from "../api";
import { SpellLang } from "../spellCheck";

interface EditorToolbarProps {
  projectName?: string;
  saving: "idle" | "saving" | "saved";
  engine: Project["engine"];
  onEngineChange: (engine: Project["engine"]) => void;
  shellEscape: boolean;
  onToggleShellEscape: () => void;
  spellLang: SpellLang;
  onSpellLangChange: (lang: SpellLang) => void;
  onBack: () => void;
  onToggleLog: () => void;
  onDownload: () => void;
  pdfReady: boolean;
  compiling: boolean;
  onCompile: () => void;
}

export default function EditorToolbar(props: EditorToolbarProps) {
  const {
    projectName,
    saving,
    engine,
    onEngineChange,
    shellEscape,
    onToggleShellEscape,
    spellLang,
    onSpellLangChange,
    onBack,
    onToggleLog,
    onDownload,
    pdfReady,
    compiling,
    onCompile,
  } = props;

  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-2">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-muted hover:text-white">
          ← Projects
        </button>
        <span className="text-sm font-medium">{projectName}</span>
        <span className="text-xs text-muted">
          {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : ""}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={engine ?? "auto"}
          onChange={(e) => onEngineChange(e.target.value as Project["engine"])}
          title="LaTeX engine. 'auto' honors a % !TEX program magic comment, else pdfLaTeX."
          className="rounded-md border border-border bg-panel px-2 py-1.5 text-sm text-white hover:bg-white/5"
          style={{ colorScheme: "dark" }}
        >
          <option value="auto" className="bg-panel text-white">engine: auto</option>
          <option value="pdflatex" className="bg-panel text-white">pdfLaTeX</option>
          <option value="xelatex" className="bg-panel text-white">XeLaTeX</option>
          <option value="lualatex" className="bg-panel text-white">LuaLaTeX</option>
        </select>
        <button
          onClick={onToggleShellEscape}
          title="Allow the document to run shell commands during compile (e.g. minted). Enable only for trusted projects."
          className={`rounded-md border px-3 py-1.5 text-sm transition ${
            shellEscape
              ? "border-amber-500/60 bg-amber-500/10 text-amber-400"
              : "border-border hover:bg-white/5"
          }`}
        >
          shell-escape: {shellEscape ? "on" : "off"}
        </button>
        <select
          value={spellLang}
          onChange={(e) => onSpellLangChange(e.target.value as SpellLang)}
          title="Spell check language"
          className="rounded-md border border-border bg-panel px-2 py-1.5 text-sm text-white hover:bg-white/5"
          style={{ colorScheme: "dark" }}
        >
          <option value="off" className="bg-panel text-white">spell: off</option>
          <option value="en" className="bg-panel text-white">spell: EN</option>
          <option value="es" className="bg-panel text-white">spell: ES</option>
          <option value="both" className="bg-panel text-white">spell: EN+ES</option>
        </select>
        <button
          onClick={onToggleLog}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-white/5"
        >
          Log
        </button>
        <button
          onClick={onDownload}
          disabled={!pdfReady}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-white/5 disabled:opacity-40"
        >
          Download PDF
        </button>
        <button
          onClick={onCompile}
          disabled={compiling}
          className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
        >
          {compiling ? "Compiling…" : "Compile"}
        </button>
      </div>
    </header>
  );
}
