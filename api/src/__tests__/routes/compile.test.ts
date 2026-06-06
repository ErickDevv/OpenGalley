import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("../../db", () => ({
  pool: { query: vi.fn() },
}));

vi.mock("../../storage", () => ({
  syncFilesToDisk: vi.fn(),
  readPdf: vi.fn(),
  buildOutDir: vi.fn().mockReturnValue("/tmp/out"),
}));

vi.mock("../../compiler", () => ({
  compile: vi.fn(),
}));

vi.mock("../../template", () => ({
  MAIN_PATH: "main.tex",
}));

import { pool } from "../../db";
import { syncFilesToDisk, readPdf } from "../../storage";
import { compile } from "../../compiler";
import { compileRouter } from "../../routes/compile";

const mockPool = pool as { query: ReturnType<typeof vi.fn> };

const app = express();
app.use(express.json());
app.use("/", compileRouter);
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err.message });
});

const SETTINGS = { rows: [{ main_path: "main.tex", shell_escape: false, engine: "auto" }] };
const FILES = {
  rows: [{ path: "main.tex", content: "\\documentclass{article}", data: null, is_binary: false }],
};

beforeEach(() => {
  vi.clearAllMocks();
  (syncFilesToDisk as ReturnType<typeof vi.fn>).mockResolvedValue({
    dir: "/tmp/proj",
    mainAbs: "/tmp/proj/main.tex",
  });
});

// ─── POST /:id/compile ───────────────────────────────────────────────────────

describe("POST /:id/compile", () => {
  it("returns ok:true on successful compile", async () => {
    mockPool.query
      .mockResolvedValueOnce(SETTINGS)
      .mockResolvedValueOnce(FILES);
    (compile as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, log: "Done." });

    const res = await request(app).post("/proj-1/compile").send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, log: "Done." });
  });

  it("returns 422 on compile failure", async () => {
    mockPool.query
      .mockResolvedValueOnce(SETTINGS)
      .mockResolvedValueOnce(FILES);
    (compile as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      log: "! Undefined control sequence.",
    });

    const res = await request(app).post("/proj-1/compile").send({});
    expect(res.status).toBe(422);
    expect(res.body.ok).toBe(false);
    expect(res.body.log).toContain("Undefined control sequence");
  });

  it("returns 404 when project has no files", async () => {
    mockPool.query
      .mockResolvedValueOnce(SETTINGS)
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/proj-1/compile").send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("project has no files");
  });

  it("passes custom main file from request body", async () => {
    mockPool.query
      .mockResolvedValueOnce(SETTINGS)
      .mockResolvedValueOnce(FILES);
    (compile as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, log: "" });

    await request(app).post("/proj-1/compile").send({ main: "thesis.tex" });

    expect(syncFilesToDisk).toHaveBeenCalledWith(
      "proj-1",
      expect.anything(),
      "thesis.tex"
    );
  });

  it("falls back to project main_path when body.main absent", async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ main_path: "report.tex", shell_escape: false, engine: "auto" }] })
      .mockResolvedValueOnce(FILES);
    (compile as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, log: "" });

    await request(app).post("/proj-1/compile").send({});

    expect(syncFilesToDisk).toHaveBeenCalledWith(
      "proj-1",
      expect.anything(),
      "report.tex"
    );
  });

  it("passes shellEscape and engine to compile()", async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ main_path: "main.tex", shell_escape: true, engine: "xelatex" }] })
      .mockResolvedValueOnce(FILES);
    (compile as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, log: "" });

    await request(app).post("/proj-1/compile").send({});

    expect(compile).toHaveBeenCalledWith(
      "proj-1",
      expect.any(String),
      { shellEscape: true, engine: "xelatex" }
    );
  });
});

// ─── GET /:id/pdf ────────────────────────────────────────────────────────────

describe("GET /:id/pdf", () => {
  it("serves the compiled PDF", async () => {
    const pdfBuf = Buffer.from("%PDF-1.4 test");
    (readPdf as ReturnType<typeof vi.fn>).mockResolvedValue(pdfBuf);

    const res = await request(app).get("/proj-1/pdf");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.body).toEqual(pdfBuf);
  });

  it("returns 404 when no PDF compiled yet", async () => {
    (readPdf as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("no pdf in output"));

    const res = await request(app).get("/proj-1/pdf");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("no compiled pdf, compile first");
  });
});
