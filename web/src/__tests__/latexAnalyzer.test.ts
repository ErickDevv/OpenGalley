import { describe, it, expect } from "vitest";
import { analyzeLatex } from "../latexAnalyzer";

describe("analyzeLatex", () => {
  it("returns no markers for valid document", () => {
    const tex = `\\begin{document}\nHello world\n\\end{document}`;
    expect(analyzeLatex(tex)).toHaveLength(0);
  });

  it("detects unmatched closing brace", () => {
    const markers = analyzeLatex("text}more");
    expect(markers).toHaveLength(1);
    expect(markers[0].severity).toBe("error");
    expect(markers[0].message).toBe("Unmatched }");
    expect(markers[0].startLineNumber).toBe(1);
  });

  it("detects unclosed opening brace", () => {
    const markers = analyzeLatex("\\textbf{hello");
    expect(markers).toHaveLength(1);
    expect(markers[0].severity).toBe("error");
    expect(markers[0].message).toBe("Unclosed {");
  });

  it("detects \\end without matching \\begin", () => {
    const markers = analyzeLatex("\\end{document}");
    expect(markers).toHaveLength(1);
    expect(markers[0].message).toContain("no matching \\begin");
  });

  it("detects mismatched \\begin/\\end", () => {
    // mismatch error + unclosed-begin warning for the unpopped figure
    const markers = analyzeLatex("\\begin{figure}\n\\end{table}");
    expect(markers).toHaveLength(2);
    const err = markers.find((m) => m.severity === "error")!;
    expect(err.message).toContain("Expected \\end{figure}");
    expect(err.message).toContain("got \\end{table}");
  });

  it("warns on unclosed \\begin", () => {
    const markers = analyzeLatex("\\begin{equation}\nx = 1");
    expect(markers).toHaveLength(1);
    expect(markers[0].severity).toBe("warning");
    expect(markers[0].message).toContain("Unclosed \\begin{equation}");
  });

  it("ignores braces inside comments", () => {
    const markers = analyzeLatex("% { unclosed in comment");
    expect(markers).toHaveLength(0);
  });

  it("handles escaped braces correctly", () => {
    const markers = analyzeLatex("\\{ \\}");
    expect(markers).toHaveLength(0);
  });

  it("handles nested environments", () => {
    const tex = [
      "\\begin{document}",
      "\\begin{figure}",
      "\\begin{center}",
      "\\end{center}",
      "\\end{figure}",
      "\\end{document}",
    ].join("\n");
    expect(analyzeLatex(tex)).toHaveLength(0);
  });

  it("reports correct line numbers", () => {
    const tex = "line1\nline2\n}";
    const markers = analyzeLatex(tex);
    expect(markers[0].startLineNumber).toBe(3);
  });

  it("handles multiple errors in one document", () => {
    const tex = "} extra close\n\\begin{align}";
    const markers = analyzeLatex(tex);
    const errors = markers.filter((m) => m.severity === "error");
    const warnings = markers.filter((m) => m.severity === "warning");
    expect(errors).toHaveLength(1);
    expect(warnings).toHaveLength(1);
  });
});
