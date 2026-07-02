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

// ─── POST /:id/upload ────────────────────────────────────────────────────────

describe("POST /:id/upload", () => {
  it("stores binary asset and returns 201", async () => {
    mockPool.query.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .post("/uuid-1/upload")
      .send({ path: "fig.png", data: Buffer.from("PNG").toString("base64") });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, path: "fig.png" });
  });

  it("returns 400 when path is missing", async () => {
    const res = await request(app).post("/uuid-1/upload").send({ data: "abc" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when data is missing", async () => {
    const res = await request(app).post("/uuid-1/upload").send({ path: "fig.png" });
    expect(res.status).toBe(400);
  });
});

// ─── POST /:id/files/batch ───────────────────────────────────────────────────

describe("POST /:id/files/batch", () => {
  it("inserts text and binary files, returns count", async () => {
    mockClient([
      { rows: [] }, // BEGIN
      { rows: [] }, // INSERT text
      { rows: [] }, // INSERT binary
      { rows: [] }, // UPDATE project
      { rows: [] }, // COMMIT
    ]);
    const res = await request(app)
      .post("/uuid-1/files/batch")
      .send({
        files: [
          { path: "main.tex", content: "\\documentclass{article}" },
          { path: "fig.png", data: Buffer.from("PNG").toString("base64") },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, count: 2 });
  });

  it("returns 400 when files array is absent", async () => {
    const res = await request(app).post("/uuid-1/files/batch").send({});
    expect(res.status).toBe(400);
  });

  it("returns 413 when more than 500 files", async () => {
    const files = Array.from({ length: 501 }, (_, i) => ({ path: `f${i}.tex`, content: "" }));
    const res = await request(app).post("/uuid-1/files/batch").send({ files });
    expect(res.status).toBe(413);
  });

  it("skips items with empty path in count", async () => {
    mockClient([
      { rows: [] }, // BEGIN
      { rows: [] }, // INSERT ok.tex only
      { rows: [] }, // UPDATE project
      { rows: [] }, // COMMIT
    ]);
    const res = await request(app)
      .post("/uuid-1/files/batch")
      .send({ files: [{ path: "", content: "ignored" }, { path: "ok.tex", content: "ok" }] });
    expect(res.status).toBe(201);
    expect(res.body.count).toBe(1);
  });
});

// ─── GET /:id/asset/* ────────────────────────────────────────────────────────

describe("GET /:id/asset/*", () => {
  it("serves PNG with correct MIME type", async () => {
    mockPool.query.mockResolvedValue({ rows: [{ data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }] });
    const res = await request(app).get("/uuid-1/asset/fig.png");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
  });

  it("serves PDF with correct MIME type", async () => {
    mockPool.query.mockResolvedValue({ rows: [{ data: Buffer.from("%PDF") }] });
    const res = await request(app).get("/uuid-1/asset/doc.pdf");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
  });

  it("returns 404 when asset not found", async () => {
    mockPool.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get("/uuid-1/asset/missing.png");
    expect(res.status).toBe(404);
  });

  it("uses application/octet-stream for unknown extension", async () => {
    mockPool.query.mockResolvedValue({ rows: [{ data: Buffer.from("data") }] });
    const res = await request(app).get("/uuid-1/asset/file.xyz");
    expect(res.headers["content-type"]).toContain("application/octet-stream");
  });
});
