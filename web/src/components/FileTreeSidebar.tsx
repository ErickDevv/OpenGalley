import { RefObject } from "react";
import { TreeNode } from "../fileTree";
import FileTreeView from "./FileTreeView";

interface FileTreeSidebarProps {
  tree: TreeNode[];
  active: string;
  mainPath?: string;
  collapsed: Set<string>;
  dragOverFolder: string | null;
  fileInputRef: RefObject<HTMLInputElement>;
  folderInputRef: RefObject<HTMLInputElement>;
  onNewFile: () => void;
  onNewFolder: () => void;
  onPickFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
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

export default function FileTreeSidebar(props: FileTreeSidebarProps) {
  const {
    tree,
    active,
    mainPath,
    collapsed,
    dragOverFolder,
    fileInputRef,
    folderInputRef,
    onNewFile,
    onNewFolder,
    onPickFiles,
    ...treeHandlers
  } = props;

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-panel">
      <div className="flex items-center justify-between px-3 py-2 text-xs uppercase tracking-wide text-muted">
        <span>Files</span>
        <div className="flex gap-1">
          <button title="New file" onClick={onNewFile} className="rounded px-1.5 hover:bg-white/10">
            +
          </button>
          <button title="New folder" onClick={onNewFolder} className="rounded px-1.5 hover:bg-white/10">
            📁
          </button>
          <button
            title="Upload files"
            onClick={() => fileInputRef.current?.click()}
            className="rounded px-1.5 hover:bg-white/10"
          >
            ↑
          </button>
          <button
            title="Upload folder"
            onClick={() => folderInputRef.current?.click()}
            className="rounded px-1.5 hover:bg-white/10"
          >
            ▤
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onPickFiles} />
          <input
            ref={folderInputRef}
            type="file"
            className="hidden"
            onChange={onPickFiles}
            // @ts-expect-error non-standard but widely supported
            webkitdirectory=""
          />
        </div>
      </div>
      <FileTreeView
        tree={tree}
        active={active}
        mainPath={mainPath}
        collapsed={collapsed}
        dragOverFolder={dragOverFolder}
        {...treeHandlers}
      />
    </aside>
  );
}
