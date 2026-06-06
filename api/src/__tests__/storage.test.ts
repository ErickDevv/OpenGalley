import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { projectDir, buildOutDir, safeJoin, syncFilesToDisk, readPdf } from "../storage";

// ─── projectDir ──────────────────────────────────────────────────────────────

describe("projectDir", () => {
  it("appends projectId to DATA_DIR", () => {
    process.env.DATA_DIR = "/custom/data";
    expect(projectDir("abc-123")).toBe("/custom/data/abc-123");
    delete process.env.DATA_DIR;
  });

  it("defaults to /data when DATA_DIR is unset", () => {
    delete process.env.DATA_DIR;
    expect(projectDir("abc-123")).toBe("/data/abc-123");
  });
});

// ─── buildOutDir ─────────────────────────────────────────────────────────────

describe("buildOutDir", () => {
  it("appends /output to projectDir", () => {
    process.env.DATA_DIR = "/custom/data";
    expect(buildOutDir("abc-123")).toBe("/custom/data/abc-123/output");
    delete process.env.DATA_DIR;
  });
});

// ─── safeJoin ────────────────────────────────────────────────────────────────

describe("safeJoin", () => {
  const base = "/safe/base";

  it("allows a normal relative path", () => {
    expect(safeJoin(base, "main.tex")).toBe("/safe/base/main.tex");
  });

  it("allows a nested relative path", () => {
    expect(safeJoin(base, "sections/intro.tex")).toBe("/safe/base/sections/intro.tex");
  });

  it("throws on path traversal with ..", () => {
    expect(() => safeJoin(base, "../etc/passwd")).toThrow("invalid path");
  });

  it("throws on traversal that escapes via subdirectory", () => {
    expect(() => safeJoin(base, "sub/../../escape")).toThrow("invalid path");
  });

  it("does not throw for paths that stay within base", () => {
    expect(() => safeJoin(base, "a/../b/file.tex")).not.toThrow();
  });
});

// ─── syncFilesToDisk ─────────────────────────────────────────────────────────

describe("syncFilesToDisk", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sync-test-"));
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it("writes text files to disk", async () => {
    const files = [{ path: "main.tex", content: "\\documentclass{article}", data: null, is_binary: false }];
    await syncFilesToDisk("p1", files, "main.tex");
    const written = await fs.readFile(path.join(tmpDir, "p1", "main.tex"), "utf8");
    expect(written).toBe("\\documentclass{article}");
  });

  it("writes binary files to disk", async () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const files = [{ path: "fig.png", content: null, data: buf, is_binary: true }];
    await syncFilesToDisk("p2", files, "fig.png");
    const written = await fs.readFile(path.join(tmpDir, "p2", "fig.png"));
    expect(written).toEqual(buf);
  });

  it("creates nested directories for files", async () => {
    const files = [{ path: "chapters/intro.tex", content: "hello", data: null, is_binary: false }];
    await syncFilesToDisk("p3", files, "chapters/intro.tex");
    const exists = await fs
      .access(path.join(tmpDir, "p3", "chapters", "intro.tex"))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it("returns correct mainAbs path", async () => {
    const files = [{ path: "main.tex", content: "", data: null, is_binary: false }];
    const { mainAbs } = await syncFilesToDisk("p4", files, "main.tex");
    expect(mainAbs).toBe(path.join(tmpDir, "p4", "main.tex"));
  });

  it("cleans previous project files before syncing", async () => {
    const dir = path.join(tmpDir, "p5");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "old.tex"), "stale");

    await syncFilesToDisk("p5", [{ path: "main.tex", content: "new", data: null, is_binary: false }], "main.tex");

    const hasOld = await fs.access(path.join(dir, "old.tex")).then(() => true).catch(() => false);
    expect(hasOld).toBe(false);
  });

  it("writes empty string for text file with null content", async () => {
    const files = [{ path: "empty.tex", content: null, data: null, is_binary: false }];
    await syncFilesToDisk("p6", files, "empty.tex");
    const written = await fs.readFile(path.join(tmpDir, "p6", "empty.tex"), "utf8");
    expect(written).toBe("");
  });
});

// ─── readPdf ─────────────────────────────────────────────────────────────────

describe("readPdf", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-test-"));
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it("reads the PDF from the output directory", async () => {
    const outDir = path.join(tmpDir, "pdf1", "output");
    await fs.mkdir(outDir, { recursive: true });
    const pdfContent = Buffer.from("%PDF-1.4");
    await fs.writeFile(path.join(outDir, "main.pdf"), pdfContent);

    const result = await readPdf("pdf1");
    expect(result).toEqual(pdfContent);
  });

  it("finds PDF regardless of extension case", async () => {
    const outDir = path.join(tmpDir, "pdf2", "output");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, "DOCUMENT.PDF"), Buffer.from("%PDF"));

    const result = await readPdf("pdf2");
    expect(result.toString()).toBe("%PDF");
  });

  it("throws 'no pdf in output' when directory has no PDF", async () => {
    const outDir = path.join(tmpDir, "pdf3", "output");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, "main.log"), "log content");

    await expect(readPdf("pdf3")).rejects.toThrow("no pdf in output");
  });

  it("throws when output directory does not exist", async () => {
    await expect(readPdf("nonexistent-project")).rejects.toThrow();
  });
});
