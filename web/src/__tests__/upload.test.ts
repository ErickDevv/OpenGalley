import { describe, it, expect } from "vitest";
import { detectMainPath, itemsFromFileList } from "../upload";
import type { UploadItem } from "../upload";

// ─── detectMainPath ───────────────────────────────────────────────────────────

describe("detectMainPath", () => {
  it("returns undefined for empty list", () => {
    expect(detectMainPath([])).toBeUndefined();
  });

  it("prefers main.tex regardless of position", () => {
    const items: UploadItem[] = [
      { path: "other.tex", content: "\\documentclass{article}" },
      { path: "main.tex", content: "" },
    ];
    expect(detectMainPath(items)).toBe("main.tex");
  });

  it("falls back to root file with \\documentclass", () => {
    const items: UploadItem[] = [
      { path: "chapters/intro.tex", content: "\\documentclass{article}" },
      { path: "thesis.tex", content: "\\documentclass{report}" },
    ];
    expect(detectMainPath(items)).toBe("thesis.tex");
  });

  it("picks any file with \\documentclass if none at root", () => {
    const items: UploadItem[] = [
      { path: "sections/intro.tex", content: "just text" },
      { path: "sections/main.tex", content: "\\documentclass{article}" },
    ];
    expect(detectMainPath(items)).toBe("sections/main.tex");
  });

  it("falls back to any root .tex file", () => {
    const items: UploadItem[] = [
      { path: "root.tex", content: "no docclass" },
      { path: "sub/other.tex", content: "no docclass" },
    ];
    expect(detectMainPath(items)).toBe("root.tex");
  });

  it("falls back to first .tex file overall", () => {
    const items: UploadItem[] = [
      { path: "sub/first.tex", content: "no docclass" },
    ];
    expect(detectMainPath(items)).toBe("sub/first.tex");
  });

  it("ignores binary items (null content)", () => {
    const items: UploadItem[] = [
      { path: "image.png", data: "abc123" },
      { path: "doc.tex", content: "\\documentclass{article}" },
    ];
    expect(detectMainPath(items)).toBe("doc.tex");
  });
});

// ─── itemsFromFileList ────────────────────────────────────────────────────────

function makeFile(name: string, content: string, relativePath?: string): File {
  const file = new File([content], name, { type: "text/plain" });
  if (relativePath) {
    Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
  }
  return file;
}

// jsdom has no DataTransfer; itemsFromFileList only calls Array.from(list) so a plain array suffices.
function toFileList(files: File[]): FileList {
  return files as unknown as FileList;
}

describe("itemsFromFileList", () => {
  it("creates text items for .tex files", async () => {
    const files = [makeFile("main.tex", "\\documentclass{article}")];
    const items = await itemsFromFileList(toFileList(files));
    expect(items).toHaveLength(1);
    expect(items[0].path).toBe("main.tex");
    expect(items[0].content).toBe("\\documentclass{article}");
    expect(items[0].data).toBeUndefined();
  });

  it("creates binary items for image files", async () => {
    const files = [makeFile("fig.png", "\x89PNG\r\n")];
    const items = await itemsFromFileList(toFileList(files));
    expect(items[0].data).toBeDefined();
    expect(items[0].content).toBeUndefined();
  });

  it("strips shared top-level folder from relative paths", async () => {
    const files = [
      makeFile("main.tex", "content", "thesis/main.tex"),
      makeFile("refs.bib", "refs", "thesis/refs.bib"),
    ];
    const items = await itemsFromFileList(toFileList(files));
    expect(items.map((i) => i.path)).toEqual(["main.tex", "refs.bib"]);
  });

  it("preserves paths without a shared root", async () => {
    const files = [
      makeFile("a.tex", "a", "chap1/a.tex"),
      makeFile("b.tex", "b", "chap2/b.tex"),
    ];
    const items = await itemsFromFileList(toFileList(files));
    expect(items.map((i) => i.path)).toEqual(["chap1/a.tex", "chap2/b.tex"]);
  });

  it("recognises all text extensions", async () => {
    const textExts = ["tex", "sty", "cls", "bib", "md", "txt", "yml", "json"];
    for (const ext of textExts) {
      const files = [makeFile(`file.${ext}`, "content")];
      const [item] = await itemsFromFileList(toFileList(files));
      expect(item.content, `${ext} should be text`).toBeDefined();
    }
  });
});
