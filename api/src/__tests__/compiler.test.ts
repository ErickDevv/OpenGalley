import { describe, it, expect } from "vitest";
import { engineFromMagic } from "../compiler";

describe("engineFromMagic", () => {
  it("returns null for plain LaTeX with no magic comment", () => {
    expect(engineFromMagic("\\documentclass{article}\n\\begin{document}")).toBeNull();
  });

  it("detects xelatex from % !TEX program = xelatex", () => {
    expect(engineFromMagic("% !TEX program = xelatex\n\\documentclass{article}")).toBe("xelatex");
  });

  it("detects xetex alias as xelatex", () => {
    expect(engineFromMagic("% !TEX program = xetex")).toBe("xelatex");
  });

  it("detects lualatex", () => {
    expect(engineFromMagic("% !TEX program = lualatex")).toBe("lualatex");
  });

  it("detects luatex alias as lualatex", () => {
    expect(engineFromMagic("% !TEX program = luatex")).toBe("lualatex");
  });

  it("detects pdflatex", () => {
    expect(engineFromMagic("% !TEX program = pdflatex")).toBe("pdflatex");
  });

  it("detects latex alias as pdflatex", () => {
    expect(engineFromMagic("% !TEX program = latex")).toBe("pdflatex");
  });

  it("is case-insensitive for the directive", () => {
    expect(engineFromMagic("% !tex program = XeLaTeX")).toBe("xelatex");
  });

  it("handles TS-program variant", () => {
    expect(engineFromMagic("% !TEX TS-program = lualatex")).toBe("lualatex");
  });

  it("allows whitespace between parts", () => {
    expect(engineFromMagic("%  !TEX  program  =  xelatex")).toBe("xelatex");
  });

  it("returns null for an unknown engine name", () => {
    expect(engineFromMagic("% !TEX program = tectonic")).toBeNull();
  });

  it("picks up comment on second line", () => {
    const src = "% file: thesis.tex\n% !TEX program = xelatex\n\\documentclass{book}";
    expect(engineFromMagic(src)).toBe("xelatex");
  });
});
