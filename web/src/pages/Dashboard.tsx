import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, Project } from "../api";
import { viewNav } from "../viewTransition";

import {
  detectMainPath,
  itemsFromDrop,
  itemsFromFileList,
  itemsFromZip,
  UploadItem,
} from "../upload";

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importDrag, setImportDrag] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const zipInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  async function load() {
    setProjects(await api.listProjects());
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    setCreating(true);
    try {
      const name = prompt("Project name", "Untitled Project");
      if (name === null) return;
      const p = await api.createProject(name || "Untitled Project");
      viewNav(nav, `/p/${p.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function importItems(items: UploadItem[], name: string) {
    if (items.length === 0) {
      alert("No files found to import.");
      return;
    }
    setImporting(true);
    setImportOpen(false);
    try {
      const p = await api.createProject(name, false);
      await api.uploadBatch(p.id, items);
      const main = detectMainPath(items);
      if (main) await api.patchProject(p.id, { main_path: main });
      viewNav(nav, `/p/${p.id}`);
    } finally {
      setImporting(false);
    }
  }

  async function handleImportDrop(dt: DataTransfer) {
    setImportDrag(false);

    const entries = Array.from(dt.items ?? [])
      .filter((i) => i.kind === "file")
      .map((i) => i.webkitGetAsEntry?.() ?? null);

    const dirEntry = entries.find((e) => e?.isDirectory);

    if (dirEntry) {
      importItems(await itemsFromDrop(dt), dirEntry.name || "Imported Project");
    } else if (
      dt.files.length === 1 &&
      dt.files[0].name.toLowerCase().endsWith(".zip")
    ) {
      const file = dt.files[0];
      importItems(
        await itemsFromZip(file),
        file.name.replace(/\.zip$/i, "") || "Imported Project"
      );
    } else {
      importItems(await itemsFromFileList(dt.files), "Imported Project");
    }
  }

  async function onZip(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    importItems(
      await itemsFromZip(file),
      file.name.replace(/\.zip$/i, "") || "Imported Project"
    );
  }

  async function onFolder(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    e.target.value = "";
    if (!list || !list.length) return;
    const top = (list[0] as File & { webkitRelativePath?: string })
      .webkitRelativePath?.split("/")[0];
    importItems(await itemsFromFileList(list), top || "Imported Project");
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await api.deleteProject(id);
    load();
  }

  function handleDragStart(id: string) {
    setDragId(id);
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (dragId && dragId !== id) setDragOverId(id);
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const next = [...projects];
    const from = next.findIndex((p) => p.id === dragId);
    const to = next.findIndex((p) => p.id === targetId);
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setProjects(next);
    setDragId(null);
    setDragOverId(null);
    api.reorderProjects(next.map((p) => p.id));
  }

  function handleDragEnd() {
    setDragId(null);
    setDragOverId(null);
  }

  function startRename(p: Project) {
    setRenaming(p.id);
    setRenameValue(p.name);
  }

  async function commitRename(id: string) {
    const trimmed = renameValue.trim();
    setRenaming(null);
    if (!trimmed) return;
    const updated = await api.patchProject(id, { name: trimmed });
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name: updated.name } : p)));
  }

  return (
    <div className="min-h-full">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">OpenGalley</span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-muted">
              LaTeX
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImportOpen(true)}
              disabled={importing}
              className="rounded-md border border-border px-3 py-1.5 text-sm transition hover:bg-white/5 disabled:opacity-50"
            >
              {importing ? "Importing…" : "Import project"}
            </button>
            <button
              onClick={create}
              disabled={creating}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-50"
            >
              + New Project
            </button>
          </div>
        </div>

        <input
          ref={zipInput}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={onZip}
        />
        <input
          ref={folderInput}
          type="file"
          className="hidden"
          onChange={onFolder}
          // @ts-expect-error non-standard but widely supported
          webkitdirectory=""
        />
      </header>

      {/* Import modal */}
      {importOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setImportOpen(false);
          }}
        >
          <div className="relative w-full max-w-md rounded-xl border border-border bg-panel p-6 shadow-2xl">
            <button
              onClick={() => setImportOpen(false)}
              className="absolute right-4 top-4 text-muted transition hover:text-white"
            >
              ✕
            </button>
            <h2 className="mb-1 text-base font-semibold">Import project</h2>
            <p className="mb-5 text-sm text-muted">
              Drop a .zip archive or a folder — detected automatically.
            </p>

            {/* Drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setImportDrag(true);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) setImportDrag(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleImportDrop(e.dataTransfer);
              }}
              className={`flex h-44 cursor-default flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition ${
                importDrag
                  ? "border-white/50 bg-white/5"
                  : "border-border hover:border-white/20"
              }`}
            >
              <span className="text-2xl text-muted">
                {importDrag ? "↓" : "⊕"}
              </span>
              <p className="text-sm text-muted">
                {importDrag
                  ? "Release to import"
                  : "Drop .zip or folder here"}
              </p>
            </div>

            {/* Fallback pickers */}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => zipInput.current?.click()}
                className="flex-1 rounded-md border border-border px-3 py-2 text-sm transition hover:bg-white/5"
              >
                Pick .zip file
              </button>
              <button
                onClick={() => folderInput.current?.click()}
                className="flex-1 rounded-md border border-border px-3 py-2 text-sm transition hover:bg-white/5"
              >
                Pick folder
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-6 py-8">
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted">No projects yet.</p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() => setImportOpen(true)}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-white/5"
              >
                Import project
              </button>
              <button
                onClick={create}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-white/5"
              >
                Create your first project
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <div
                key={p.id}
                draggable
                onDragStart={() => handleDragStart(p.id)}
                onDragOver={(e) => handleDragOver(e, p.id)}
                onDrop={(e) => handleDrop(e, p.id)}
                onDragEnd={handleDragEnd}
                className={`group relative rounded-lg border bg-panel p-4 transition cursor-grab active:cursor-grabbing select-none flex flex-col gap-3
                  ${dragId === p.id ? "opacity-40" : ""}
                  ${dragOverId === p.id && dragId !== p.id ? "border-white/60" : "border-border hover:border-white/40"}`}
              >
                {renaming === p.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(p.id);
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    className="w-full bg-transparent font-medium outline-none border-b border-white/40 pb-0.5"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <Link
                    to={`/p/${p.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      viewNav(nav, `/p/${p.id}`);
                    }}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      startRename(p);
                    }}
                    className="block"
                  >
                    <h3 className="truncate font-medium">{p.name}</h3>
                    <p className="mt-1 text-xs text-muted">
                      Updated {new Date(p.updated_at).toLocaleString()}
                    </p>
                  </Link>
                )}
                <div className="flex gap-1 border-t border-border pt-2 -mx-4 px-4">
                  <button
                    onClick={(e) => { e.preventDefault(); startRename(p); }}
                    className="rounded px-2 py-1 text-xs text-muted hover:bg-white/10 hover:text-white"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => remove(p.id, p.name)}
                    className="rounded px-2 py-1 text-xs text-muted hover:bg-white/10 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
