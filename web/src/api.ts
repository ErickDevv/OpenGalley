export interface Project {
  id: string;
  name: string;
  main_path: string;
  shell_escape: boolean;
  engine: "auto" | "pdflatex" | "xelatex" | "lualatex";
  created_at: string;
  updated_at: string;
}

export interface ProjectFile {
  path: string;
  content: string | null;
  is_binary: boolean;
  updated_at?: string;
}

export interface CompileResult {
  ok: boolean;
  log: string;
}

const base = "/api";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok && res.status !== 422) {
    const body = await res.text();
    throw new Error(body || res.statusText);
  }
  return res.json();
}

export const api = {
  listProjects: () => fetch(`${base}/projects`).then(json<Project[]>),

  createProject: (name: string, seed = true) =>
    fetch(`${base}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, seed }),
    }).then(json<Project>),

  deleteProject: (id: string) =>
    fetch(`${base}/projects/${id}`, { method: "DELETE" }),

  reorderProjects: (ids: string[]) =>
    fetch(`${base}/projects/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }),

  patchProject: (
    id: string,
    patch: {
      name?: string;
      main_path?: string;
      shell_escape?: boolean;
      engine?: Project["engine"];
    }
  ) =>
    fetch(`${base}/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then(json<Project>),

  listFiles: (id: string) =>
    fetch(`${base}/projects/${id}/files`).then(json<ProjectFile[]>),

  saveFile: (id: string, path: string, content: string) =>
    fetch(`${base}/projects/${id}/files/${encodeURIComponent(path)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),

  deleteFile: (id: string, path: string) =>
    fetch(`${base}/projects/${id}/files/${encodeURIComponent(path)}`, {
      method: "DELETE",
    }),

  renameFile: (id: string, from: string, to: string) =>
    fetch(`${base}/projects/${id}/files/${encodeURIComponent(from)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to }),
    }).then(json<{ ok: boolean; count: number }>),

  uploadBatch: (
    id: string,
    files: { path: string; content?: string; data?: string }[]
  ) =>
    fetch(`${base}/projects/${id}/files/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    }).then(json<{ ok: boolean; count: number }>),

  uploadAsset: (id: string, path: string, dataBase64: string) =>
    fetch(`${base}/projects/${id}/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, data: dataBase64 }),
    }),

  assetUrl: (id: string, path: string) =>
    `${base}/projects/${id}/asset/${encodeURIComponent(path)}`,

  compile: (id: string, main?: string) =>
    fetch(`${base}/projects/${id}/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(main ? { main } : {}),
    }).then(json<CompileResult>),

  pdfUrl: (id: string, bust: number) =>
    `${base}/projects/${id}/pdf?t=${bust}`,
};
