// Helpers to turn dropped/selected files (incl. whole folders) into the batch
// upload payload, preserving relative paths so multi-file projects just work.
import JSZip from "jszip";

export interface UploadItem {
  path: string;
  content?: string;
  data?: string; // base64 for binary
}

const TEXT_EXT = new Set([
  "tex", "sty", "cls", "bib", "bbl", "bst", "txt", "md", "csv", "json",
  "yml", "yaml", "cfg", "def", "ltx", "tikz", "dtx", "ins", "clo", "fd",
  "log", "ist", "gst", "toc", "lof", "lot", "aux", "out",
]);

function isText(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXT.has(ext);
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk) as unknown as number[]
    );
  }
  return btoa(bin);
}

async function toItem(file: File, relPath: string): Promise<UploadItem> {
  if (isText(relPath)) {
    return { path: relPath, content: await file.text() };
  }
  return { path: relPath, data: bufToBase64(await file.arrayBuffer()) };
}

// Strip a shared top-level folder (e.g. "thesis/") so main.tex lands at root.
function stripCommonRoot(paths: string[]): (p: string) => string {
  const tops = new Set(
    paths.map((p) => (p.includes("/") ? p.split("/")[0] : ""))
  );
  if (tops.size === 1 && !tops.has("")) {
    const top = [...tops][0] + "/";
    return (p) => (p.startsWith(top) ? p.slice(top.length) : p);
  }
  return (p) => p;
}

// From a folder/multi-file <input>
export async function itemsFromFileList(list: FileList): Promise<UploadItem[]> {
  const files = Array.from(list);
  const rawPaths = files.map((f) => (f as any).webkitRelativePath || f.name);
  const strip = stripCommonRoot(rawPaths);
  return Promise.all(
    files.map((f, i) => toItem(f, strip(rawPaths[i]).replace(/^\/+/, "")))
  );
}

// Extract a .zip entirely in the browser into upload items.
export async function itemsFromZip(file: File): Promise<UploadItem[]> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  const strip = stripCommonRoot(entries.map((e) => e.name));
  const items: UploadItem[] = [];
  for (const entry of entries) {
    const rel = strip(entry.name).replace(/^\/+/, "");
    // skip junk like __MACOSX/ and dotfiles at root
    if (!rel || rel.startsWith("__MACOSX/") || rel.startsWith(".")) continue;
    if (isText(rel)) items.push({ path: rel, content: await entry.async("string") });
    else items.push({ path: rel, data: await entry.async("base64") });
  }
  return items;
}

// Guess the compile entry point from a set of uploaded items.
export function detectMainPath(items: UploadItem[]): string | undefined {
  const texts = items.filter(
    (i) => i.path.toLowerCase().endsWith(".tex") && i.content != null
  );
  const hasDoc = (i: UploadItem) => /\\documentclass/.test(i.content || "");
  const atRoot = (i: UploadItem) => !i.path.includes("/");

  return (
    texts.find((i) => i.path === "main.tex") ||
    texts.find((i) => atRoot(i) && hasDoc(i)) ||
    texts.find((i) => hasDoc(i)) ||
    texts.find(atRoot) ||
    texts[0]
  )?.path;
}

// Recursively read a dropped directory entry (webkit API)
function readEntry(entry: any, prefix: string): Promise<File[]> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file: File) => {
        (file as any)._relPath = prefix + entry.name;
        resolve([file]);
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const all: Promise<File[]>[] = [];
      const readBatch = () =>
        reader.readEntries(async (entries: any[]) => {
          if (entries.length === 0) {
            resolve((await Promise.all(all)).flat());
            return;
          }
          for (const e of entries)
            all.push(readEntry(e, prefix + entry.name + "/"));
          readBatch();
        });
      readBatch();
    } else {
      resolve([]);
    }
  });
}

// From a drag-and-drop event (supports folders + loose files)
export async function itemsFromDrop(dt: DataTransfer): Promise<UploadItem[]> {
  const entries: any[] = [];
  const looseFiles: File[] = [];
  for (const item of Array.from(dt.items)) {
    const entry = (item as any).webkitGetAsEntry?.();
    if (entry) entries.push(entry);
    else {
      const f = item.getAsFile();
      if (f) looseFiles.push(f);
    }
  }

  let files: File[] = [];
  if (entries.length) {
    files = (await Promise.all(entries.map((e) => readEntry(e, "")))).flat();
  } else {
    files = looseFiles;
    files.forEach((f) => ((f as any)._relPath = f.name));
  }

  const rawPaths = files.map((f) => (f as any)._relPath || f.name);
  const strip = stripCommonRoot(rawPaths);
  return Promise.all(
    files.map((f, i) => toItem(f, strip(rawPaths[i]).replace(/^\/+/, "")))
  );
}
