import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type * as MonacoType from "monaco-editor";
import { marked } from "marked";
import DOMPurify from "dompurify";
import Papa from "papaparse";
import { api, Project, ProjectFile } from "../api";
import { itemsFromDrop, itemsFromFileList, UploadItem } from "../upload";
import { revalidateSpell } from "../monacoSetup";
import { getSpellLang, setSpellLang, SpellLang } from "../spellCheck";
import { DRAG_MIME, FOLDER_MARKER, buildTree } from "../fileTree";
import { viewNav } from "../viewTransition";
import { useSplitPane } from "../useSplitPane";
import EditorToolbar from "../components/EditorToolbar";
import FileTreeSidebar from "../components/FileTreeSidebar";
import SourcePane from "../components/SourcePane";
import PreviewPane from "../components/PreviewPane";

export { DRAG_MIME };

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
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [spellLang, setSpellLangState] = useState<SpellLang>(getSpellLang);
  const [mdPreview, setMdPreview] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);
  const { ratio: splitRatio, containerRef: splitRef, startResize } = useSplitPane("textex.splitRatio");

  const activeFile = files.find((f) => f.path === active);
  const isMarkdown = active.toLowerCase().endsWith(".md");
  const renderedMarkdown = useMemo(
    () =>
      isMarkdown
        ? DOMPurify.sanitize(marked.parse(content, { async: false }) as string)
        : "",
    [isMarkdown, content]
  );
  const tree = useMemo(() => buildTree(files), [files]);
  const isCsv = active.toLowerCase().endsWith(".csv");
  const csvRows = useMemo(
    () =>
      isCsv
        ? (Papa.parse<string[]>(content, { skipEmptyLines: false })
            .data as string[][])
        : [],
    [isCsv, content]
  );

  function addCsvRow() {
    const cols = csvRows[0]?.length || 1;
    const rows = [...csvRows, new Array(cols).fill("")];
    const next = Papa.unparse(rows);
    setContent(next);
    scheduleSave(next, active);
  }

  function deleteCsvRow(row: number) {
    const rows = csvRows.filter((_, i) => i !== row);
    const next = Papa.unparse(rows);
    setContent(next);
    scheduleSave(next, active);
  }

  function editCsvCell(row: number, col: number, value: string) {
    const rows = csvRows.map((r) => r.slice());
    while (rows.length <= row) rows.push([]);
    while (rows[row].length <= col) rows[row].push("");
    rows[row][col] = value;
    const next = Papa.unparse(rows);
    setContent(next);
    scheduleSave(next, active);
  }

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
    setMdPreview(true);
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

  async function newFolder() {
    if (!id) return;
    const path = prompt("New folder path (e.g. images)");
    if (!path) return;
    await api.saveFile(id, `${path.replace(/\/+$/, "")}/${FOLDER_MARKER}`, "");
    await refresh();
  }

  async function renamePath(path: string, isFolder: boolean) {
    if (!id) return;
    const to = prompt(isFolder ? "Rename folder to" : "Rename file to", path);
    if (!to || to === path) return;
    try {
      await api.renameFile(id, path, to);
      let nextActive: string | undefined;
      if (isFolder) {
        if (active === path || active.startsWith(`${path}/`))
          nextActive = to + active.slice(path.length);
      } else if (active === path) {
        nextActive = to;
      }
      await refresh(nextActive);
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    }
  }

  async function removeFolder(path: string) {
    if (!id) return;
    if (!confirm(`Delete folder "${path}" and everything inside it?`)) return;
    const prefix = `${path}/`;
    const targets = files.filter((f) => f.path.startsWith(prefix));
    for (const f of targets) await api.deleteFile(id, f.path);
    await refresh();
  }

  function toggleFolder(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
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
    if (!e.dataTransfer) return;
    const from = e.dataTransfer.getData(DRAG_MIME);
    if (from) return movePath(from, "");
    await pushItems(await itemsFromDrop(e.dataTransfer));
  }

  async function onFolderDrop(e: React.DragEvent, folderPath: string) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(null);
    setDragOver(false);
    if (!e.dataTransfer) return;
    const from = e.dataTransfer.getData(DRAG_MIME);
    if (from) return movePath(from, folderPath);
    const items = await itemsFromDrop(e.dataTransfer);
    await pushItems(items.map((i) => ({ ...i, path: `${folderPath}/${i.path}` })));
  }

  async function movePath(from: string, toFolder: string) {
    if (!id) return;
    const base = from.split("/").pop()!;
    const to = toFolder ? `${toFolder}/${base}` : base;
    if (to === from || to.startsWith(`${from}/`)) return;
    try {
      await api.renameFile(id, from, to);
      let nextActive: string | undefined;
      if (active === from || active.startsWith(`${from}/`))
        nextActive = to + active.slice(from.length);
      await refresh(nextActive);
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    }
  }

  async function runCompile() {
    if (!id) return;
    flushSave();
    if (activeFile && !activeFile.is_binary)
      await api.saveFile(id, active, content);
    setSaving("saved");

    const mainPath = project?.main_path;
    if (mainPath && active !== mainPath) {
      const f = files.find((x) => x.path === mainPath);
      setActive(mainPath);
      setContent(f && !f.is_binary ? f.content ?? "" : "");
      setMdPreview(true);
    }

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
    } catch (e) {
      setLog(String(e instanceof Error ? e.message : e));
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
      <EditorToolbar
        projectName={project?.name}
        saving={saving}
        engine={project?.engine ?? "auto"}
        onEngineChange={async (engine) => {
          if (!id) return;
          const p = await api.patchProject(id, { engine });
          setProject(p);
        }}
        shellEscape={!!project?.shell_escape}
        onToggleShellEscape={toggleShellEscape}
        spellLang={spellLang}
        onSpellLangChange={(lang) => {
          setSpellLang(lang);
          setSpellLangState(lang);
          if (editorRef.current) revalidateSpell(editorRef.current);
        }}
        onBack={() => viewNav(nav, "/")}
        onToggleLog={() => setShowLog((s) => !s)}
        onDownload={download}
        pdfReady={!!pdfBust}
        compiling={compiling}
        onCompile={runCompile}
      />

      <div
        className="relative flex min-h-0 flex-1"
        onDragOver={(e) => {
          e.preventDefault();
          if (e.dataTransfer?.types.includes(DRAG_MIME)) return;
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
        <FileTreeSidebar
          tree={tree}
          active={active}
          mainPath={mainPath}
          collapsed={collapsed}
          dragOverFolder={dragOverFolder}
          fileInputRef={fileInput}
          folderInputRef={folderInput}
          onNewFile={newFile}
          onNewFolder={newFolder}
          onPickFiles={onPickFiles}
          onToggleFolder={toggleFolder}
          onOpenFile={openFile}
          onRenamePath={renamePath}
          onRemoveFolder={removeFolder}
          onRemoveFile={removeFile}
          onSetMain={setMain}
          onFolderDragOver={setDragOverFolder}
          onFolderDragLeave={(path) =>
            setDragOverFolder((p) => (p === path ? null : p))
          }
          onFolderDrop={onFolderDrop}
        />

        <div ref={splitRef} className="flex min-w-0 flex-1">
          <SourcePane
            loaded={loaded}
            activeFile={activeFile}
            active={active}
            projectId={id!}
            content={content}
            style={{ flex: `0 0 ${splitRatio * 100}%` }}
            onChange={(value) => {
              setContent(value);
              scheduleSave(value, active);
            }}
            onEditorMount={(editor) => {
              editorRef.current = editor;
            }}
          />

          <div
            onMouseDown={startResize}
            className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-white/30 active:bg-white/40"
          />

          <PreviewPane
            activeFile={activeFile}
            projectId={id!}
            isMarkdown={isMarkdown}
            mdPreview={mdPreview}
            onToggleMdPreview={() => setMdPreview((s) => !s)}
            renderedMarkdown={renderedMarkdown}
            isCsv={isCsv}
            csvRows={csvRows}
            onEditCsvCell={editCsvCell}
            onDeleteCsvRow={deleteCsvRow}
            onAddCsvRow={addCsvRow}
            pdfBust={pdfBust}
            showLog={showLog}
            log={log}
            style={{ flex: `0 0 ${(1 - splitRatio) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
