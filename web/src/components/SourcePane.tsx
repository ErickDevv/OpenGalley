import MonacoEditor from "@monaco-editor/react";
import type * as MonacoType from "monaco-editor";
import { api, ProjectFile } from "../api";
import { setupLatexValidation } from "../monacoSetup";
import { langForPath } from "../fileTree";

interface SourcePaneProps {
  loaded: boolean;
  activeFile?: ProjectFile;
  active: string;
  projectId: string;
  content: string;
  onChange: (value: string) => void;
  onEditorMount: (editor: MonacoType.editor.IStandaloneCodeEditor) => void;
}

export default function SourcePane(props: SourcePaneProps) {
  const { loaded, activeFile, active, projectId, content, onChange, onEditorMount } = props;

  return (
    <div className="relative min-w-0 flex-1 border-r border-border">
      {loaded && activeFile && !activeFile.is_binary && (
        <MonacoEditor
          key={active}
          height="100%"
          language={langForPath(active)}
          theme="vs-dark"
          value={content}
          onChange={(v) => onChange(v ?? "")}
          onMount={(editor) => {
            onEditorMount(editor);
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
            src={api.assetUrl(projectId, active)}
            title={active}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <img
              src={api.assetUrl(projectId, active)}
              alt={active}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        )
      )}
    </div>
  );
}
