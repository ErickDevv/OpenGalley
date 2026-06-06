import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { analyzeLatex } from "./latexAnalyzer";
import { getSpellMarkers, getSuggestionsFor } from "./spellCheck";

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
      [/[\[\]]/, "delimiter.square"],
      [/\$[^$]*\$/, "string"],
    ],
  },
});

// ─── Autocomplete ─────────────────────────────────────────────────────────────

const ENVIRONMENTS = [
  "document", "abstract",
  "figure", "figure*", "table", "table*", "tabular", "tabular*", "array",
  "equation", "equation*", "align", "align*", "aligned",
  "gather", "gather*", "multline", "multline*", "split",
  "itemize", "enumerate", "description",
  "center", "flushleft", "flushright",
  "verbatim", "verbatim*", "lstlisting",
  "minipage", "quote", "quotation", "verse",
  "theorem", "lemma", "proof", "definition", "corollary", "remark",
  "tikzpicture", "scope",
];

const PACKAGES = [
  "amsmath", "amssymb", "amsthm", "amsfonts",
  "geometry", "graphicx", "xcolor", "hyperref",
  "biblatex", "natbib", "cite",
  "booktabs", "longtable", "multirow", "array",
  "listings", "minted", "verbatim",
  "tikz", "pgfplots",
  "fontenc", "inputenc", "babel", "polyglossia",
  "setspace", "parskip", "microtype",
  "cleveref", "varioref",
  "algorithm", "algorithmicx", "algpseudocode",
  "float", "caption", "subcaption",
  "enumitem", "mdframed", "tcolorbox",
];

interface CmdDef { label: string; insert: string; doc?: string }

const COMMANDS: CmdDef[] = [
  // Structure
  { label: "documentclass", insert: "documentclass[${1:12pt}]{${2:article}}" },
  { label: "usepackage", insert: "usepackage{${1:package}}" },
  { label: "begin", insert: "begin{${1:equation}}\n\t$0\n\\end{${1:equation}}" },
  { label: "end", insert: "end{${1:environment}}" },
  { label: "input", insert: "input{${1:file}}" },
  { label: "include", insert: "include{${1:file}}" },
  // Sectioning
  { label: "chapter", insert: "chapter{${1:title}}" },
  { label: "section", insert: "section{${1:title}}" },
  { label: "subsection", insert: "subsection{${1:title}}" },
  { label: "subsubsection", insert: "subsubsection{${1:title}}" },
  { label: "paragraph", insert: "paragraph{${1:title}}" },
  { label: "subparagraph", insert: "subparagraph{${1:title}}" },
  // Text formatting
  { label: "textbf", insert: "textbf{${1:text}}", doc: "Bold" },
  { label: "textit", insert: "textit{${1:text}}", doc: "Italic" },
  { label: "emph", insert: "emph{${1:text}}", doc: "Emphasized" },
  { label: "underline", insert: "underline{${1:text}}" },
  { label: "texttt", insert: "texttt{${1:text}}", doc: "Monospace" },
  { label: "textrm", insert: "textrm{${1:text}}", doc: "Roman" },
  { label: "textsf", insert: "textsf{${1:text}}", doc: "Sans-serif" },
  { label: "textsc", insert: "textsc{${1:text}}", doc: "Small caps" },
  { label: "text", insert: "text{${1:text}}", doc: "Text in math mode" },
  // Math
  { label: "frac", insert: "frac{${1:num}}{${2:den}}" },
  { label: "dfrac", insert: "dfrac{${1:num}}{${2:den}}" },
  { label: "sqrt", insert: "sqrt{${1:x}}" },
  { label: "sum", insert: "sum_{${1:i=1}}^{${2:n}}" },
  { label: "prod", insert: "prod_{${1:i=1}}^{${2:n}}" },
  { label: "int", insert: "int_{${1:a}}^{${2:b}}" },
  { label: "lim", insert: "lim_{${1:n \\to \\infty}}" },
  { label: "infty", insert: "infty", doc: "∞" },
  { label: "partial", insert: "partial", doc: "∂" },
  { label: "nabla", insert: "nabla", doc: "∇" },
  { label: "cdot", insert: "cdot", doc: "·" },
  { label: "cdots", insert: "cdots" },
  { label: "ldots", insert: "ldots" },
  { label: "times", insert: "times", doc: "×" },
  { label: "div", insert: "div", doc: "÷" },
  { label: "pm", insert: "pm", doc: "±" },
  { label: "leq", insert: "leq", doc: "≤" },
  { label: "geq", insert: "geq", doc: "≥" },
  { label: "neq", insert: "neq", doc: "≠" },
  { label: "approx", insert: "approx", doc: "≈" },
  { label: "equiv", insert: "equiv", doc: "≡" },
  { label: "in", insert: "in", doc: "∈" },
  { label: "notin", insert: "notin", doc: "∉" },
  { label: "subset", insert: "subset", doc: "⊂" },
  { label: "subseteq", insert: "subseteq", doc: "⊆" },
  { label: "cup", insert: "cup", doc: "∪" },
  { label: "cap", insert: "cap", doc: "∩" },
  { label: "forall", insert: "forall", doc: "∀" },
  { label: "exists", insert: "exists", doc: "∃" },
  { label: "land", insert: "land", doc: "∧" },
  { label: "lor", insert: "lor", doc: "∨" },
  { label: "neg", insert: "neg", doc: "¬" },
  { label: "to", insert: "to", doc: "→" },
  { label: "Rightarrow", insert: "Rightarrow", doc: "⇒" },
  { label: "Leftrightarrow", insert: "Leftrightarrow", doc: "⟺" },
  { label: "leftarrow", insert: "leftarrow", doc: "←" },
  { label: "rightarrow", insert: "rightarrow", doc: "→" },
  // Greek lowercase
  { label: "alpha", insert: "alpha", doc: "α" },
  { label: "beta", insert: "beta", doc: "β" },
  { label: "gamma", insert: "gamma", doc: "γ" },
  { label: "delta", insert: "delta", doc: "δ" },
  { label: "epsilon", insert: "epsilon", doc: "ε" },
  { label: "varepsilon", insert: "varepsilon", doc: "ε (var)" },
  { label: "zeta", insert: "zeta", doc: "ζ" },
  { label: "eta", insert: "eta", doc: "η" },
  { label: "theta", insert: "theta", doc: "θ" },
  { label: "vartheta", insert: "vartheta", doc: "ϑ" },
  { label: "iota", insert: "iota", doc: "ι" },
  { label: "kappa", insert: "kappa", doc: "κ" },
  { label: "lambda", insert: "lambda", doc: "λ" },
  { label: "mu", insert: "mu", doc: "μ" },
  { label: "nu", insert: "nu", doc: "ν" },
  { label: "xi", insert: "xi", doc: "ξ" },
  { label: "pi", insert: "pi", doc: "π" },
  { label: "rho", insert: "rho", doc: "ρ" },
  { label: "sigma", insert: "sigma", doc: "σ" },
  { label: "tau", insert: "tau", doc: "τ" },
  { label: "upsilon", insert: "upsilon", doc: "υ" },
  { label: "phi", insert: "phi", doc: "φ" },
  { label: "varphi", insert: "varphi", doc: "ϕ" },
  { label: "chi", insert: "chi", doc: "χ" },
  { label: "psi", insert: "psi", doc: "ψ" },
  { label: "omega", insert: "omega", doc: "ω" },
  // Greek uppercase
  { label: "Gamma", insert: "Gamma", doc: "Γ" },
  { label: "Delta", insert: "Delta", doc: "Δ" },
  { label: "Theta", insert: "Theta", doc: "Θ" },
  { label: "Lambda", insert: "Lambda", doc: "Λ" },
  { label: "Xi", insert: "Xi", doc: "Ξ" },
  { label: "Pi", insert: "Pi", doc: "Π" },
  { label: "Sigma", insert: "Sigma", doc: "Σ" },
  { label: "Upsilon", insert: "Upsilon", doc: "Υ" },
  { label: "Phi", insert: "Phi", doc: "Φ" },
  { label: "Psi", insert: "Psi", doc: "Ψ" },
  { label: "Omega", insert: "Omega", doc: "Ω" },
  // References & citations
  { label: "label", insert: "label{${1:key}}" },
  { label: "ref", insert: "ref{${1:key}}" },
  { label: "eqref", insert: "eqref{${1:key}}" },
  { label: "pageref", insert: "pageref{${1:key}}" },
  { label: "cite", insert: "cite{${1:key}}" },
  { label: "citet", insert: "citet{${1:key}}" },
  { label: "citep", insert: "citep{${1:key}}" },
  { label: "footnote", insert: "footnote{${1:text}}" },
  // Lists
  { label: "item", insert: "item ${1}" },
  // Layout
  { label: "newline", insert: "newline" },
  { label: "newpage", insert: "newpage" },
  { label: "clearpage", insert: "clearpage" },
  { label: "hspace", insert: "hspace{${1:1cm}}" },
  { label: "vspace", insert: "vspace{${1:1cm}}" },
  { label: "hfill", insert: "hfill" },
  { label: "vfill", insert: "vfill" },
  { label: "noindent", insert: "noindent" },
  { label: "centering", insert: "centering" },
  // Tables
  { label: "hline", insert: "hline" },
  { label: "cline", insert: "cline{${1:1}-${2:2}}" },
  { label: "multicolumn", insert: "multicolumn{${1:2}}{${2:c}}{${3:text}}" },
  { label: "multirow", insert: "multirow{${1:2}}{*}{${2:text}}" },
  // Figures
  { label: "includegraphics", insert: "includegraphics[${1:width=0.8\\textwidth}]{${2:filename}}" },
  { label: "caption", insert: "caption{${1:caption text}}" },
  // Math operators & accents
  { label: "left", insert: "left${1:(}" },
  { label: "right", insert: "right${1:)}" },
  { label: "overline", insert: "overline{${1:x}}" },
  { label: "overbrace", insert: "overbrace{${1:x}}^{${2:label}}" },
  { label: "underbrace", insert: "underbrace{${1:x}}_{${2:label}}" },
  { label: "hat", insert: "hat{${1:x}}" },
  { label: "tilde", insert: "tilde{${1:x}}" },
  { label: "vec", insert: "vec{${1:x}}" },
  { label: "bar", insert: "bar{${1:x}}" },
  { label: "dot", insert: "dot{${1:x}}" },
  { label: "ddot", insert: "ddot{${1:x}}" },
  { label: "mathbb", insert: "mathbb{${1:R}}", doc: "Blackboard bold" },
  { label: "mathcal", insert: "mathcal{${1:L}}", doc: "Calligraphic" },
  { label: "mathbf", insert: "mathbf{${1:x}}" },
  { label: "mathrm", insert: "mathrm{${1:d}}" },
  // Bibliography
  { label: "bibliography", insert: "bibliography{${1:refs}}" },
  { label: "bibliographystyle", insert: "bibliographystyle{${1:plain}}" },
  // Misc
  { label: "maketitle", insert: "maketitle" },
  { label: "tableofcontents", insert: "tableofcontents" },
  { label: "listoffigures", insert: "listoffigures" },
  { label: "listoftables", insert: "listoftables" },
  { label: "appendix", insert: "appendix" },
  { label: "title", insert: "title{${1:title}}" },
  { label: "author", insert: "author{${1:author}}" },
  { label: "date", insert: "date{${1:\\today}}" },
  { label: "today", insert: "today" },
  { label: "newcommand", insert: "newcommand{\\${1:name}}[${2:0}]{${3:definition}}" },
  { label: "renewcommand", insert: "renewcommand{\\${1:name}}[${2:0}]{${3:definition}}" },
  { label: "newenvironment", insert: "newenvironment{${1:name}}{${2:begin}}{${3:end}}" },
];

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
