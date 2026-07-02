import { ProjectFile } from "./api";

export const FOLDER_MARKER = ".gitkeep";
export const DRAG_MIME = "application/x-textex-path";

export interface FolderNode {
  type: "folder";
  name: string;
  path: string;
  children: TreeNode[];
}
export interface FileNode {
  type: "file";
  name: string;
  path: string;
  file: ProjectFile;
}
export type TreeNode = FolderNode | FileNode;

export function buildTree(files: ProjectFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folders = new Map<string, FolderNode>();

  function folderChildren(path: string): TreeNode[] {
    if (!path) return root;
    const existing = folders.get(path);
    if (existing) return existing.children;
    const slash = path.lastIndexOf("/");
    const name = slash === -1 ? path : path.slice(slash + 1);
    const parent = slash === -1 ? "" : path.slice(0, slash);
    const node: FolderNode = { type: "folder", name, path, children: [] };
    folders.set(path, node);
    folderChildren(parent).push(node);
    return node.children;
  }

  for (const f of files) {
    const slash = f.path.lastIndexOf("/");
    const name = slash === -1 ? f.path : f.path.slice(slash + 1);
    const parent = slash === -1 ? "" : f.path.slice(0, slash);
    if (name === FOLDER_MARKER) {
      folderChildren(parent); // touch the folder so it renders even if empty
      continue;
    }
    folderChildren(parent).push({ type: "file", name, path: f.path, file: f });
  }

  function sort(nodes: TreeNode[]) {
    nodes.sort((a, b) =>
      a.type !== b.type
        ? a.type === "folder"
          ? -1
          : 1
        : a.name.localeCompare(b.name)
    );
    for (const n of nodes) if (n.type === "folder") sort(n.children);
  }
  sort(root);
  return root;
}

export function langForPath(path: string): string {
  if (path.endsWith(".tex") || path.endsWith(".sty") || path.endsWith(".cls"))
    return "latex";
  if (path.endsWith(".bib")) return "bibtex";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".csv")) return "plaintext";
  return "plaintext";
}
