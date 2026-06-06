import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("../../db", () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock("../../template", () => ({
  DEFAULT_MAIN: "\\documentclass{article}",
  MAIN_PATH: "main.tex",
}));

import { pool } from "../../db";
import { projects } from "../../routes/projects";

const mockPool = pool as { query: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn> };

const app = express();
app.use(express.json());
app.use("/", projects);
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err.message });
});

const PROJECT = {
  id: "uuid-1",
  name: "Test Project",
  main_path: "main.tex",
  shell_escape: false,
  engine: "auto",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

/**
 * Build a fake pool client that returns responses in order.
 * Sequence for POST / with seed:
 *   [0] BEGIN
 *   [1] uniqueProjectName SELECT  ← must return { rows: [] } for no conflict
 *   [2] INSERT projects RETURNING ← must return { rows: [PROJECT] }
 *   [3] INSERT files
 *   fallback: { rows: [] } for COMMIT
 */
function mockClient(responses: { rows: unknown[] }[]) {
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

// ─── GET / ───────────────────────────────────────────────────────────────────

describe("GET /", () => {
  it("returns projects array", async () => {
    mockPool.query.mockResolvedValue({ rows: [PROJECT] });
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([PROJECT]);
  });

  it("returns empty array when no projects exist", async () => {
    mockPool.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ─── POST /reorder ───────────────────────────────────────────────────────────

describe("POST /reorder", () => {
  it("accepts valid ids and returns ok", async () => {
    const client = mockClient([
      { rows: [] }, // BEGIN
      { rows: [] }, // UPDATE id[0]
      { rows: [] }, // UPDATE id[1]
      { rows: [] }, // COMMIT
    ]);
    const res = await request(app).post("/reorder").send({ ids: ["a", "b"] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(client.release).toHaveBeenCalled();
  });

  it("returns 400 when ids array is empty", async () => {
    const res = await request(app).post("/reorder").send({ ids: [] });
    expect(res.status).toBe(400);
  });

  it("returns 400 when ids is absent", async () => {
    const res = await request(app).post("/reorder").send({});
    expect(res.status).toBe(400);
  });
});

// ─── POST / ──────────────────────────────────────────────────────────────────

describe("POST /", () => {
  it("creates seeded project and returns 201", async () => {
    mockClient([
      { rows: [] },         // [0] BEGIN
      { rows: [] },         // [1] uniqueProjectName SELECT (no conflicts)
      { rows: [PROJECT] },  // [2] INSERT projects RETURNING
      { rows: [] },         // [3] INSERT seed file
      // COMMIT uses fallback { rows: [] }
    ]);
    const res = await request(app).post("/").send({ name: "Test Project", seed: true });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Test Project");
  });

  it("creates project without seeding when seed:false", async () => {
    mockClient([
      { rows: [] },         // [0] BEGIN
      { rows: [] },         // [1] uniqueProjectName SELECT
      { rows: [PROJECT] },  // [2] INSERT projects RETURNING
      // COMMIT uses fallback
    ]);
    const res = await request(app).post("/").send({ name: "No Seed", seed: false });
    expect(res.status).toBe(201);
  });

  it("defaults name to 'Untitled Project' when body is empty", async () => {
    const client = mockClient([
      { rows: [] },
      { rows: [] },
      { rows: [{ ...PROJECT, name: "Untitled Project" }] },
      { rows: [] },
    ]);
    const res = await request(app).post("/").send({});
    expect(res.status).toBe(201);
    const nameArg = (client.query.mock.calls as unknown[][]).find(
      (c) => typeof c[0] === "string" && (c[0] as string).includes("SELECT name FROM projects")
    )?.[1] as string[];
    expect(nameArg?.[0]).toBe("Untitled Project");
  });

  it("truncates name to 200 characters", async () => {
    const longName = "A".repeat(300);
    const client = mockClient([
      { rows: [] },
      { rows: [] },
      { rows: [{ ...PROJECT, name: "A".repeat(200) }] },
      { rows: [] },
    ]);
    await request(app).post("/").send({ name: longName });
    const nameArg = (client.query.mock.calls as unknown[][]).find(
      (c) => typeof c[0] === "string" && (c[0] as string).includes("SELECT name FROM projects")
    )?.[1] as string[];
    expect((nameArg?.[0] as string)).toHaveLength(200);
  });
});

// ─── PATCH /:id ──────────────────────────────────────────────────────────────

describe("PATCH /:id", () => {
  it("renames project", async () => {
    const updated = { ...PROJECT, name: "Renamed" };
    mockClient([
      { rows: [] },          // [0] BEGIN
      { rows: [] },          // [1] uniqueProjectName SELECT
      { rows: [updated] },   // [2] UPDATE RETURNING
      // COMMIT fallback
    ]);
    const res = await request(app).patch("/uuid-1").send({ name: "Renamed" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Renamed");
  });

  it("returns 404 when project does not exist", async () => {
    mockClient([
      { rows: [] }, // BEGIN
      { rows: [] }, // uniqueProjectName SELECT
      { rows: [] }, // UPDATE returns no rows
      // COMMIT fallback
    ]);
    const res = await request(app).patch("/nonexistent").send({ name: "X" });
    expect(res.status).toBe(404);
  });

  it("rejects unknown engine (coalesces to existing)", async () => {
    const client = mockClient([
      { rows: [] },
      { rows: [] },
      { rows: [PROJECT] },
    ]);
    await request(app).patch("/uuid-1").send({ engine: "tectonic" });
    const updateCall = (client.query.mock.calls as unknown[][]).find(
      (c) => typeof c[0] === "string" && (c[0] as string).includes("UPDATE projects")
    );
    expect((updateCall?.[1] as unknown[])?.[3]).toBeNull();
  });

  it("accepts all valid engine values", async () => {
    for (const engine of ["auto", "pdflatex", "xelatex", "lualatex"]) {
      vi.clearAllMocks();
      // name is absent → uniqueProjectName is NOT called → only BEGIN + UPDATE RETURNING
      mockClient([
        { rows: [] },                          // [0] BEGIN
        { rows: [{ ...PROJECT, engine }] },    // [1] UPDATE RETURNING
        // COMMIT uses fallback { rows: [] }
      ]);
      const res = await request(app).patch("/uuid-1").send({ engine });
      expect(res.status).toBe(200);
    }
  });
});

// ─── DELETE /:id ─────────────────────────────────────────────────────────────

describe("DELETE /:id", () => {
  it("deletes project and returns 204", async () => {
    mockPool.query.mockResolvedValue({ rows: [] });
    const res = await request(app).delete("/uuid-1");
    expect(res.status).toBe(204);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM projects"),
      ["uuid-1"]
    );
  });
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
