import { promises as fs } from "fs";
import path from "path";

// Resolve a project's working dir on the volume, guarding against traversal.
export function projectDir(projectId: string): string {
  return path.join(process.env.DATA_DIR || "/data", projectId);
}

export function safeJoin(base: string, rel: string): string {
  const target = path.join(base, rel);
  if (!target.startsWith(base + path.sep) && target !== base) {
    throw new Error("invalid path");
  }
  return target;
}

export interface SyncFile {
  path: string;
  content: string | null;
  data: Buffer | null;
  is_binary: boolean;
}

// Mirror DB files onto the volume so Tectonic can read them, returning the
// absolute path of the main .tex entry point.
export async function syncFilesToDisk(
  projectId: string,
  files: SyncFile[],
  mainPath: string
): Promise<{ dir: string; mainAbs: string }> {
  const dir = projectDir(projectId);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  for (const f of files) {
    const abs = safeJoin(dir, f.path);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    if (f.is_binary && f.data) {
      await fs.writeFile(abs, f.data);
    } else {
      await fs.writeFile(abs, f.content ?? "", "utf8");
    }
  }
  return { dir, mainAbs: safeJoin(dir, mainPath) };
}

export async function readPdf(projectId: string): Promise<Buffer> {
  const outDir = path.join(projectDir(projectId), "output");
  const entries = await fs.readdir(outDir);
  const pdf = entries.find((f) => f.toLowerCase().endsWith(".pdf"));
  if (!pdf) throw new Error("no pdf in output");
  return fs.readFile(path.join(outDir, pdf));
}

export const buildOutDir = (projectId: string) =>
  path.join(projectDir(projectId), "output");
