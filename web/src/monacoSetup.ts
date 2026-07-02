import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { analyzeLatex } from "./latexAnalyzer";
import { getSpellMarkers, getSuggestionsFor } from "./spellCheck";
import { ENVIRONMENTS, PACKAGES, COMMANDS } from "./latexCompletions";

self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

monaco.languages.register({ id: "latex" });

monaco.languages.setMonarchTokensProvider("latex", {
  tokenizer: {
    root: [
      [/%.*$/, "comment"],
      [/\\[a-zA-Z@]+/, "keyword"],
      [/\\[^a-zA-Z]/, "keyword"],
      [/[{}]/, "delimiter.bracket"],
      [/[[\]]/, "delimiter.square"],
      [/\$[^$]*\$/, "string"],
    ],
  },
});

monaco.languages.registerCompletionItemProvider("latex", {
  triggerCharacters: ["\\"],
  provideCompletionItems(model, position) {
    const lineText = model.getLineContent(position.lineNumber);
    const textBefore = lineText.substring(0, position.column - 1);

    // Inside \begin{...} or \end{...}
    if (/\\(?:begin|end)\{[^}]*$/.test(textBefore)) {
      const braceIdx = textBefore.lastIndexOf("{");
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: braceIdx + 2, // 1-based, after the {
        endColumn: position.column,
      };
      return {
        suggestions: ENVIRONMENTS.map((env) => ({
          label: env,
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: env,
          range,
          documentation: `\\begin{${env}} ... \\end{${env}}`,
        })),
      };
    }

    // Inside \usepackage{...}
    if (/\\usepackage(?:\[[^\]]*\])?\{[^}]*$/.test(textBefore)) {
      const braceIdx = textBefore.lastIndexOf("{");
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: braceIdx + 2,
        endColumn: position.column,
      };
      return {
        suggestions: PACKAGES.map((pkg) => ({
          label: pkg,
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: pkg,
          range,
        })),
      };
    }

    // Command completions — triggered by \ or mid-command like \sec
    const cmdMatch = textBefore.match(/\\([a-zA-Z@*]*)$/);
    if (!cmdMatch) return { suggestions: [] };

    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: position.column - cmdMatch[0].length, // covers the backslash
      endColumn: position.column,
    };

    return {
      suggestions: COMMANDS.map((cmd) => ({
        label: `\\${cmd.label}`,
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: `\\${cmd.insert}`,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        filterText: `\\${cmd.label}`,
        range,
        documentation: cmd.doc,
      })),
    };
  },
});

// ─── Syntax diagnostics ───────────────────────────────────────────────────────

export function setupLatexValidation(
  editor: monaco.editor.IStandaloneCodeEditor
) {
  let spellTimer: ReturnType<typeof setTimeout> | undefined;

  function runSpell(model: monaco.editor.ITextModel) {
    clearTimeout(spellTimer);
    spellTimer = setTimeout(() => {
      if (editor.getModel() !== model) return;
      getSpellMarkers(model.getValue()).then((spellMarkers) => {
        if (editor.getModel() === model) {
          monaco.editor.setModelMarkers(model, "spell", spellMarkers);
        }
      });
    }, 800);
  }

  function validate() {
    const model = editor.getModel();
    if (!model) return;
    const text = model.getValue();
    const lintMarkers = analyzeLatex(text).map((m) => ({
      ...m,
      severity:
        m.severity === "error"
          ? monaco.MarkerSeverity.Error
          : monaco.MarkerSeverity.Warning,
    }));
    monaco.editor.setModelMarkers(model, "latex-lint", lintMarkers);
    runSpell(model);
  }

  validate();
  editor.onDidChangeModelContent(validate);
}

export function revalidateSpell(editor: monaco.editor.IStandaloneCodeEditor) {
  const model = editor.getModel();
  if (!model) return;
  getSpellMarkers(model.getValue()).then((spellMarkers) => {
    if (editor.getModel() === model) {
      monaco.editor.setModelMarkers(model, "spell", spellMarkers);
    }
  });
}

// ─── Spell-check quick fixes ──────────────────────────────────────────────────

function markerContainsPosition(
  m: monaco.editor.IMarker,
  range: monaco.IRange
): boolean {
  const mStart = m.startLineNumber * 1e6 + m.startColumn
  const mEnd = m.endLineNumber * 1e6 + m.endColumn
  const rStart = range.startLineNumber * 1e6 + range.startColumn
  const rEnd = range.endLineNumber * 1e6 + range.endColumn
  return mStart <= rEnd && mEnd >= rStart
}

for (const lang of ['latex', 'markdown', 'plaintext', 'bibtex']) {
  monaco.languages.registerCodeActionProvider(lang, {
    async provideCodeActions(model, range) {
      const markers = monaco.editor
        .getModelMarkers({ resource: model.uri })
        .filter((m) => m.owner === 'spell' && markerContainsPosition(m, range))

      if (markers.length === 0) return { actions: [], dispose: () => {} }

      const actions: monaco.languages.CodeAction[] = []

      for (const marker of markers) {
        const word = model.getValueInRange(marker)
        const suggestions = await getSuggestionsFor(word)
        for (const [i, s] of suggestions.entries()) {
          actions.push({
            title: s,
            diagnostics: [marker],
            kind: 'quickfix',
            isPreferred: i === 0,
            edit: {
              edits: [{
                resource: model.uri,
                textEdit: { range: marker, text: s },
                versionId: model.getVersionId(),
              }],
            },
          })
        }
      }

      return { actions, dispose: () => {} }
    },
  })
}

loader.config({ monaco });
