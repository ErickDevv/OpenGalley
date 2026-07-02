import { api, ProjectFile } from "../api";

interface PreviewPaneProps {
  activeFile?: ProjectFile;
  projectId: string;
  isMarkdown: boolean;
  mdPreview: boolean;
  onToggleMdPreview: () => void;
  renderedMarkdown: string;
  isCsv: boolean;
  csvRows: string[][];
  onEditCsvCell: (row: number, col: number, value: string) => void;
  onDeleteCsvRow: (row: number) => void;
  onAddCsvRow: () => void;
  pdfBust: number;
  showLog: boolean;
  log: string;
}

export default function PreviewPane(props: PreviewPaneProps) {
  const {
    activeFile,
    projectId,
    isMarkdown,
    mdPreview,
    onToggleMdPreview,
    renderedMarkdown,
    isCsv,
    csvRows,
    onEditCsvCell,
    onDeleteCsvRow,
    onAddCsvRow,
    pdfBust,
    showLog,
    log,
  } = props;

  return (
    <div className="relative min-w-0 flex-1 bg-neutral-900">
      {!activeFile?.is_binary && isMarkdown && (
        <button
          onClick={onToggleMdPreview}
          className="absolute right-2 top-2 z-10 rounded-md border border-border bg-panel/90 px-2 py-1 text-xs hover:bg-white/10"
        >
          {mdPreview ? "Hide preview" : "Show preview"}
        </button>
      )}
      {isMarkdown && mdPreview ? (
        <div
          className="markdown-preview h-full overflow-auto p-6 text-sm text-neutral-200"
          dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
        />
      ) : isCsv ? (
        <div className="h-full overflow-auto p-2">
          <table className="w-full border-collapse text-xs">
            <tbody>
              {csvRows.map((row, r) => (
                <tr key={r} className="group">
                  <td className="w-8 border-none p-0 text-center">
                    <button
                      title="Delete row"
                      onClick={() => onDeleteCsvRow(r)}
                      className="invisible flex h-full w-full items-center justify-center px-2 text-muted hover:text-red-400 group-hover:visible"
                    >
                      ✕
                    </button>
                  </td>
                  {row.map((cell, c) => (
                    <td key={c} className="border border-border p-0">
                      <input
                        value={cell}
                        onChange={(e) => onEditCsvCell(r, c, e.target.value)}
                        className={`w-full min-w-[6rem] bg-transparent px-2 py-1 outline-none focus:bg-white/10 ${
                          r === 0 ? "font-medium text-white" : "text-neutral-300"
                        }`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={onAddCsvRow}
            className="mt-2 rounded px-2 py-1 text-xs text-muted hover:bg-white/5"
          >
            + row
          </button>
        </div>
      ) : pdfBust ? (
        <iframe title="pdf" src={api.pdfUrl(projectId, pdfBust)} className="h-full w-full" />
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
  );
}
