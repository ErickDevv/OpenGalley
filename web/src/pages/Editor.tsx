import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { flushSync } from "react-dom";
import MonacoEditor from "@monaco-editor/react";
import type * as MonacoType from "monaco-editor";
import { api, Project, ProjectFile } from "../api";
import { itemsFromDrop, itemsFromFileList, UploadItem } from "../upload";
import { setupLatexValidation, revalidateSpell } from "../monacoSetup";
import { getSpellLang, setSpellLang, SpellLang } from "../spellCheck";

function langForPath(path: string): string {
  if (path.endsWith(".tex") || path.endsWith(".sty") || path.endsWith(".cls"))
    return "latex";
  if (path.endsWith(".bib")) return "bibtex";
  if (path.endsWith(".md")) return "markdown";
  return "plaintext";
}

export default function Editor() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [active, setActive] = useState<string>("");
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [compiling, setCompiling] = useState(false);
  const [log, setLog] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [pdfBust, setPdfBust] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [spellLang, setSpellLangState] = useState<SpellLang>(getSpellLang);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);

  const activeFile = files.find((f) => f.path === active);

  async function refresh(selectPath?: string) {
    if (!id) return;
    const list = await api.listFiles(id);
    setFiles(list);
    const next =
      selectPath ??
      (list.find((f) => f.path === active) ? active : "") ??
      "";
    const target =
      next || list.find((f) => !f.is_binary)?.path || list[0]?.path || "";
    setActive(target);
    const f = list.find((x) => x.path === target);
    setContent(f && !f.is_binary ? f.content ?? "" : "");
  }

  useEffect(() => {
    if (!id) return;
    (async () => {
      const projects = await api.listProjects();
      setProject(projects.find((p) => p.id === id) ?? null);
      await refresh();
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function openFile(path: string) {
    // flush pending save of current file
    flushSave();
    const f = files.find((x) => x.path === path);
    setActive(path);
    setContent(f && !f.is_binary ? f.content ?? "" : "");
  }

  function flushSave() {
    clearTimeout(saveTimer.current);
  }

  const scheduleSave = useCallback(
    (value: string, path: string) => {
      if (!id) return;
      setSaving("saving");
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await api.saveFile(id, path, value);
        setSaving("saved");
      }, 700);
    },
    [id]
  );

  async function newFile() {
    if (!id) return;
    const path = prompt("New file path (e.g. sections/intro.tex)");
    if (!path) return;
    await api.saveFile(id, path, "");
    await refresh(path);
  }

  async function removeFile(path: string) {
    if (!id) return;
    if (!confirm(`Delete "${path}"?`)) return;
    await api.deleteFile(id, path);
    await refresh();
  }

  async function setMain(path: string) {
    if (!id) return;
    const p = await api.patchProject(id, { main_path: path });
    setProject(p);
  }

  async function toggleShellEscape() {
    if (!id || !project) return;
    const next = !project.shell_escape;
    if (
      next &&
      !confirm(
        "Enable shell-escape?\n\nNeeded for packages like minted. It lets the " +
          "document run arbitrary shell commands during compilation. Only enable " +
          "for projects you trust."
      )
    )
      return;
    const p = await api.patchProject(id, { shell_escape: next });
    setProject(p);
  }

  async function pushItems(items: UploadItem[]) {
    if (!id || items.length === 0) return;
    setUploading(true);
    try {
      await api.uploadBatch(id, items);
      const first = items.find((i) => i.path.endsWith(".tex"))?.path;
      await refresh(first);
    } finally {
      setUploading(false);
    }
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    e.target.value = "";
    if (list && list.length) await pushItems(await itemsFromFileList(list));
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer) await pushItems(await itemsFromDrop(e.dataTransfer));
  }

  async function runCompile() {
    if (!id) return;
    flushSave();
    if (activeFile && !activeFile.is_binary)
      await api.saveFile(id, active, content);
    setSaving("saved");

    setCompiling(true);
    try {
      const res = await api.compile(id);
      setLog(res.log);
      if (res.ok) {
        setPdfBust(Date.now());
        setShowLog(false);
      } else {
        setShowLog(true);
      }
    } catch (e: any) {
      setLog(String(e?.message || e));
      setShowLog(true);
    } finally {
      setCompiling(false);
    }
  }

  function download() {
    if (!id || !pdfBust) return;
    const a = document.createElement("a");
    a.href = api.pdfUrl(id, pdfBust);
    a.download = `${project?.name || "document"}.pdf`;
    a.click();
  }

  const mainPath = project?.main_path;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if ("startViewTransition" in document) {
                (document as any).startViewTransition(() =>
                  flushSync(() => nav("/"))
                );
              } else {
                nav("/");
              }
            }}
            className="text-sm text-muted hover:text-white"
          >
            ← Projects
          </button>
          <span className="text-sm font-medium">{project?.name}</span>
          <span className="text-xs text-muted">
            {saving === "saving"
              ? "Saving…"
              : saving === "saved"
              ? "Saved"
              : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={project?.engine ?? "auto"}
            onChange={async (e) => {
              if (!id) return;
              const p = await api.patchProject(id, {
                engine: e.target.value as Project["engine"],
              });
              setProject(p);
            }}
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
            onClick={toggleShellEscape}
            title="Allow the document to run shell commands during compile (e.g. minted). Enable only for trusted projects."
            className={`rounded-md border px-3 py-1.5 text-sm transition ${
              project?.shell_escape
                ? "border-amber-500/60 bg-amber-500/10 text-amber-400"
                : "border-border hover:bg-white/5"
            }`}
          >
            shell-escape: {project?.shell_escape ? "on" : "off"}
          </button>
          <select
            value={spellLang}
            onChange={(e) => {
              const lang = e.target.value as SpellLang;
              setSpellLang(lang);
              setSpellLangState(lang);
              if (editorRef.current) revalidateSpell(editorRef.current);
            }}
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
            onClick={() => setShowLog((s) => !s)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-white/5"
          >
            Log
          </button>
          <button
            onClick={download}
            disabled={!pdfBust}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-white/5 disabled:opacity-40"
          >
            Download PDF
          </button>
          <button
            onClick={runCompile}
            disabled={compiling}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
          >
            {compiling ? "Compiling…" : "Compile"}
          </button>
        </div>
      </header>

      <div
        className="relative flex min-h-0 flex-1"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDrop={onDrop}
      >
        {(dragOver || uploading) && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <p className="rounded-lg border border-dashed border-white/40 px-6 py-4 text-sm">
              {uploading ? "Uploading…" : "Drop files or a folder to add them"}
            </p>
          </div>
        )}
        {/* File tree */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-panel">
          <div className="flex items-center justify-between px-3 py-2 text-xs uppercase tracking-wide text-muted">
            <span>Files</span>
            <div className="flex gap-1">
              <button
                title="New file"
                onClick={newFile}
                className="rounded px-1.5 hover:bg-white/10"
              >
                +
              </button>
              <button
                title="Upload files"
                onClick={() => fileInput.current?.click()}
                className="rounded px-1.5 hover:bg-white/10"
              >
                ↑
              </button>
              <button
                title="Upload folder"
                onClick={() => folderInput.current?.click()}
                className="rounded px-1.5 hover:bg-white/10"
              >
                ▤
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden"
                onChange={onPickFiles}
              />
              <input
                ref={folderInput}
                type="file"
                className="hidden"
                onChange={onPickFiles}
                // @ts-expect-error non-standard but widely supported
                webkitdirectory=""
                directory=""
              />
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-auto px-1 pb-2 text-sm">
            {files.map((f) => (
              <li key={f.path} className="group">
                <div
                  className={`flex items-center justify-between rounded px-2 py-1 ${
                    f.path === active ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <button
                    onClick={() => openFile(f.path)}
                    className="flex min-w-0 items-center gap-1.5 truncate text-left"
                    title={f.path}
                  >
                    <span className="text-muted">{f.is_binary ? "▣" : "≡"}</span>
                    <span className="truncate">{f.path}</span>
                    {f.path === mainPath && (
                      <span className="text-[10px] text-yellow-500">main</span>
                    )}
                  </button>
                  <div className="hidden shrink-0 gap-1 group-hover:flex">
                    {!f.is_binary && f.path !== mainPath && (
                      <button
                        title="Set as main"
                        onClick={() => setMain(f.path)}
                        className="text-muted hover:text-yellow-500"
                      >
                        ★
                      </button>
                    )}
                    <button
                      title="Delete"
                      onClick={() => removeFile(f.path)}
                      className="text-muted hover:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        {/* Editor pane */}
        <div className="min-w-0 flex-1 border-r border-border">
          {loaded && activeFile && !activeFile.is_binary && (
            <MonacoEditor
              key={active}
              height="100%"
              language={langForPath(active)}
              theme="vs-dark"
              value={content}
              onChange={(v) => {
                const value = v ?? "";
                setContent(value);
                scheduleSave(value, active);
              }}
              onMount={(editor) => {
                editorRef.current = editor;
                if (langForPath(active) === "latex") {
                  setupLatexValidation(editor);
                }
              }}
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                wordWrap: "on",
                fontFamily: "Geist Mono, ui-monospace, monospace",
                scrollBeyondLastLine: false,
                padding: { top: 12 },
              }}
            />
          )}
          {loaded && activeFile?.is_binary && (
            active.toLowerCase().endsWith(".pdf") ? (
              <iframe
                key={active}
                src={api.assetUrl(id!, active)}
                title={active}
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6">
                <img
                  src={api.assetUrl(id!, active)}
                  alt={active}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            )
          )}
        </div>

        {/* Preview pane */}
        <div className="relative min-w-0 flex-1 bg-neutral-900">
          {pdfBust ? (
            <iframe
              title="pdf"
              src={api.pdfUrl(id!, pdfBust)}
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              Compile to see the PDF preview.
            </div>
          )}

          {showLog && (
            <pre className="absolute inset-x-0 bottom-0 max-h-[50%] overflow-auto border-t border-border bg-black/95 p-4 font-mono text-xs text-neutral-300">
              {log || "No log output."}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
