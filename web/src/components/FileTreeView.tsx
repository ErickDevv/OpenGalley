import { DRAG_MIME, TreeNode } from "../fileTree";

interface FileTreeViewProps {
  tree: TreeNode[];
  active: string;
  mainPath?: string;
  collapsed: Set<string>;
  dragOverFolder: string | null;
  onToggleFolder: (path: string) => void;
  onOpenFile: (path: string) => void;
  onRenamePath: (path: string, isFolder: boolean) => void;
  onRemoveFolder: (path: string) => void;
  onRemoveFile: (path: string) => void;
  onSetMain: (path: string) => void;
  onFolderDragOver: (path: string) => void;
  onFolderDragLeave: (path: string) => void;
  onFolderDrop: (e: React.DragEvent, path: string) => void;
}

export default function FileTreeView(props: FileTreeViewProps) {
  const {
    tree,
    active,
    mainPath,
    collapsed,
    dragOverFolder,
    onToggleFolder,
    onOpenFile,
    onRenamePath,
    onRemoveFolder,
    onRemoveFile,
    onSetMain,
    onFolderDragOver,
    onFolderDragLeave,
    onFolderDrop,
  } = props;

  function renderNode(node: TreeNode, depth: number) {
    const indent = { paddingLeft: `${depth * 14 + 8}px` };
    if (node.type === "folder") {
      const isCollapsed = collapsed.has(node.path);
      return (
        <li key={node.path}>
          <div
            className={`group flex items-center justify-between rounded px-2 py-1 hover:bg-white/5 ${
              dragOverFolder === node.path ? "bg-white/10 ring-1 ring-inset ring-white/30" : ""
            }`}
            style={indent}
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.setData(DRAG_MIME, node.path);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onFolderDragOver(node.path);
            }}
            onDragLeave={(e) => {
              e.stopPropagation();
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                onFolderDragLeave(node.path);
              }
            }}
            onDrop={(e) => onFolderDrop(e, node.path)}
          >
            <button
              onClick={() => onToggleFolder(node.path)}
              className="flex min-w-0 items-center gap-1.5 truncate text-left"
              title={node.path}
            >
              <span className="text-muted">{isCollapsed ? "▸" : "▾"}</span>
              <span className="truncate">{node.name}</span>
            </button>
            <div className="hidden shrink-0 gap-1 group-hover:flex">
              <button
                title="Rename folder"
                onClick={() => onRenamePath(node.path, true)}
                className="text-muted hover:text-white"
              >
                ✎
              </button>
              <button
                title="Delete folder"
                onClick={() => onRemoveFolder(node.path)}
                className="text-muted hover:text-red-400"
              >
                ✕
              </button>
            </div>
          </div>
          {!isCollapsed && (
            <ul>{node.children.map((c) => renderNode(c, depth + 1))}</ul>
          )}
        </li>
      );
    }

    const f = node.file;
    return (
      <li key={f.path}>
        <div
          className={`group flex items-center justify-between rounded px-2 py-1 ${
            f.path === active ? "bg-white/10" : "hover:bg-white/5"
          }`}
          style={indent}
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.setData(DRAG_MIME, f.path);
            e.dataTransfer.effectAllowed = "move";
          }}
        >
          <button
            onClick={() => onOpenFile(f.path)}
            className="flex min-w-0 items-center gap-1.5 truncate text-left"
            title={f.path}
          >
            <span className="text-muted">{f.is_binary ? "▣" : "≡"}</span>
            <span className="truncate">{node.name}</span>
            {f.path === mainPath && (
              <span className="text-[10px] text-yellow-500">main</span>
            )}
          </button>
          <div className="hidden shrink-0 gap-1 group-hover:flex">
            {!f.is_binary && f.path !== mainPath && (
              <button
                title="Set as main"
                onClick={() => onSetMain(f.path)}
                className="text-muted hover:text-yellow-500"
              >
                ★
              </button>
            )}
            <button
              title="Rename"
              onClick={() => onRenamePath(f.path, false)}
              className="text-muted hover:text-white"
            >
              ✎
            </button>
            <button
              title="Delete"
              onClick={() => onRemoveFile(f.path)}
              className="text-muted hover:text-red-400"
            >
              ✕
            </button>
          </div>
        </div>
      </li>
    );
  }

  return <ul className="min-h-0 flex-1 overflow-auto px-1 pb-2 text-sm">{tree.map((n) => renderNode(n, 0))}</ul>;
}
