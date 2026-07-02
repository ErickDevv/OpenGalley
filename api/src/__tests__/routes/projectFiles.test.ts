import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("../../db", () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

import { pool } from "../../db";
import { projectFiles } from "../../routes/projectFiles";

const mockPool = pool as { query: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn> };

const app = express();
app.use(express.json());
app.use("/", projectFiles);
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err.message });
});

function mockClient(responses: { rows: unknown[]; rowCount?: number }[]) {
  let idx = 0;
  const client = {
    query: vi.fn().mockImplementation(() =>
      Promise.resolve(responses[idx++] ?? { rows: [] })
    ),
    release: vi.fn(),
  };
  mockPool.connect.mockResolvedValue(client);
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── GET /:id/files ──────────────────────────────────────────────────────────

describe("GET /:id/files", () => {
  it("returns file list for project", async () => {
    const files = [
      { path: "main.tex", content: "\\documentclass{article}", is_binary: false, updated_at: "2024-01-01" },
    ];
    mockPool.query.mockResolvedValue({ rows: files });
    const res = await request(app).get("/uuid-1/files");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(files);
  });

  it("returns empty array when project has no files", async () => {
    mockPool.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get("/uuid-1/files");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ─── PUT /:id/files/* ────────────────────────────────────────────────────────

describe("PUT /:id/files/*", () => {
  it("upserts file and returns ok", async () => {
    mockPool.query.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .put("/uuid-1/files/main.tex")
      .send({ content: "\\documentclass{article}" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });

  it("decodes URL-encoded file path", async () => {
    mockPool.query.mockResolvedValue({ rows: [] });
    await request(app).put("/uuid-1/files/sections%2Fintro.tex").send({ content: "hello" });
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO files"),
      ["uuid-1", "sections/intro.tex", "hello"]
    );
  });

  it("returns 400 when decoded path is empty", async () => {
    const res = await request(app).put("/uuid-1/files/").send({ content: "x" });
    expect(res.status).toBe(400);
  });
});

// ─── DELETE /:id/files/* ─────────────────────────────────────────────────────

describe("DELETE /:id/files/*", () => {
  it("deletes file and returns 204", async () => {
    mockPool.query.mockResolvedValue({ rows: [] });
    const res = await request(app).delete("/uuid-1/files/main.tex");
    expect(res.status).toBe(204);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM files"),
      ["uuid-1", "main.tex"]
    );
  });
});

// ─── PATCH /:id/files/* ──────────────────────────────────────────────────────

describe("PATCH /:id/files/*", () => {
  it("renames a single file and returns count", async () => {
    mockClient([
      { rows: [] }, // BEGIN
      { rows: [{ path: "renamed.tex" }], rowCount: 1 }, // exact-match UPDATE
      { rows: [] }, // UPDATE projects.main_path
      { rows: [] }, // COMMIT
    ]);
    const res = await request(app)
      .patch("/uuid-1/files/main.tex")
      .send({ to: "renamed.tex" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, count: 1 });
  });

  it("renames every file under a folder when no exact file matches", async () => {
    const client = mockClient([
      { rows: [] }, // BEGIN
      { rows: [], rowCount: 0 }, // exact-match UPDATE (no hit)
      { rows: [{ path: "chapters/intro.tex" }, { path: "chapters/notes.tex" }], rowCount: 2 }, // folder UPDATE
      { rows: [] }, // UPDATE projects.main_path
      { rows: [] }, // COMMIT
    ]);
    const res = await request(app)
      .patch("/uuid-1/files/sections")
      .send({ to: "chapters" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, count: 2 });
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("left(path, length($2::text) + 1) = $2 || '/'"),
      ["chapters", "sections", "uuid-1"]
    );
  });

  it("returns 404 and rolls back when nothing matches", async () => {
    const client = mockClient([
      { rows: [] }, // BEGIN
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [] }, // ROLLBACK
    ]);
    const res = await request(app)
      .patch("/uuid-1/files/missing.tex")
      .send({ to: "found.tex" });
    expect(res.status).toBe(404);
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("returns 400 when 'to' is missing", async () => {
    const res = await request(app).patch("/uuid-1/files/main.tex").send({});
    expect(res.status).toBe(400);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it("short-circuits with count 0 when source and destination match", async () => {
    const res = await request(app)
      .patch("/uuid-1/files/main.tex")
      .send({ to: "main.tex" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, count: 0 });
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it("returns 409 when the destination path already exists", async () => {
    const client = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql === "BEGIN" || sql === "ROLLBACK") return Promise.resolve({ rows: [] });
        const err = new Error("duplicate key value violates unique constraint") as Error & { code: string };
        err.code = "23505";
        return Promise.reject(err);
      }),
      release: vi.fn(),
    };
    mockPool.connect.mockResolvedValue(client);
    const res = await request(app)
      .patch("/uuid-1/files/main.tex")
      .send({ to: "other.tex" });
    expect(res.status).toBe(409);
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });
});
