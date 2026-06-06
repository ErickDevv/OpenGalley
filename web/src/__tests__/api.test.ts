import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "../api";
import type { Project, ProjectFile, CompileResult } from "../api";

const mockProject: Project = {
  id: "proj-1",
  name: "Test Project",
  main_path: "main.tex",
  shell_escape: false,
  engine: "auto",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const mockFile: ProjectFile = {
  path: "main.tex",
  content: "\\documentclass{article}",
  is_binary: false,
};

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(String(body)),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("api.listProjects", () => {
  it("GETs /api/projects and returns array", async () => {
    vi.stubGlobal("fetch", mockFetch([mockProject]));
    const result = await api.listProjects();
    expect(fetch).toHaveBeenCalledWith("/api/projects");
    expect(result).toEqual([mockProject]);
  });
});

describe("api.createProject", () => {
  it("POSTs with name and seed=true by default", async () => {
    vi.stubGlobal("fetch", mockFetch(mockProject));
    await api.createProject("My Project");
    expect(fetch).toHaveBeenCalledWith("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Project", seed: true }),
    });
  });

  it("respects seed=false", async () => {
    vi.stubGlobal("fetch", mockFetch(mockProject));
    await api.createProject("Empty", false);
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.seed).toBe(false);
  });
});

describe("api.deleteProject", () => {
  it("sends DELETE to /api/projects/:id", async () => {
    vi.stubGlobal("fetch", mockFetch(null, 204));
    await api.deleteProject("proj-1");
    expect(fetch).toHaveBeenCalledWith("/api/projects/proj-1", {
      method: "DELETE",
    });
  });
});

describe("api.patchProject", () => {
  it("sends PATCH with provided fields", async () => {
    vi.stubGlobal("fetch", mockFetch(mockProject));
    await api.patchProject("proj-1", { name: "Renamed", engine: "xelatex" });
    expect(fetch).toHaveBeenCalledWith("/api/projects/proj-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed", engine: "xelatex" }),
    });
  });
});

describe("api.reorderProjects", () => {
  it("POSTs ids to /api/projects/reorder", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: true }));
    await api.reorderProjects(["b", "a"]);
    expect(fetch).toHaveBeenCalledWith("/api/projects/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["b", "a"] }),
    });
  });
});

describe("api.listFiles", () => {
  it("GETs /api/projects/:id/files", async () => {
    vi.stubGlobal("fetch", mockFetch([mockFile]));
    const result = await api.listFiles("proj-1");
    expect(fetch).toHaveBeenCalledWith("/api/projects/proj-1/files");
    expect(result).toEqual([mockFile]);
  });
});

describe("api.saveFile", () => {
  it("PUTs encoded path with content", async () => {
    vi.stubGlobal("fetch", mockFetch(null, 200));
    await api.saveFile("proj-1", "sections/intro.tex", "Hello");
    expect(fetch).toHaveBeenCalledWith(
      "/api/projects/proj-1/files/sections%2Fintro.tex",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Hello" }),
      }
    );
  });
});

describe("api.deleteFile", () => {
  it("sends DELETE to encoded file path", async () => {
    vi.stubGlobal("fetch", mockFetch(null, 204));
    await api.deleteFile("proj-1", "main.tex");
    expect(fetch).toHaveBeenCalledWith(
      "/api/projects/proj-1/files/main.tex",
      { method: "DELETE" }
    );
  });
});

describe("api.uploadBatch", () => {
  it("POSTs files array to /files/batch", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: true, count: 2 }));
    const files = [
      { path: "main.tex", content: "\\documentclass{article}" },
      { path: "fig.png", data: "abc123" },
    ];
    const result = await api.uploadBatch("proj-1", files);
    expect(result.count).toBe(2);
    expect(fetch).toHaveBeenCalledWith(
      "/api/projects/proj-1/files/batch",
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("api.compile", () => {
  it("POSTs to /compile and returns result", async () => {
    const compileResult: CompileResult = { ok: true, log: "Success" };
    vi.stubGlobal("fetch", mockFetch(compileResult));
    const result = await api.compile("proj-1");
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "/api/projects/proj-1/compile",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("includes main in body when provided", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: true, log: "" }));
    await api.compile("proj-1", "thesis.tex");
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.main).toBe("thesis.tex");
  });

  it("sends empty body when no main specified", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: true, log: "" }));
    await api.compile("proj-1");
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body).toEqual({});
  });
});

describe("api.pdfUrl / api.assetUrl", () => {
  it("pdfUrl includes cache-bust param", () => {
    expect(api.pdfUrl("proj-1", 12345)).toBe("/api/projects/proj-1/pdf?t=12345");
  });

  it("assetUrl encodes the file path", () => {
    expect(api.assetUrl("proj-1", "images/fig.png")).toBe(
      "/api/projects/proj-1/asset/images%2Ffig.png"
    );
  });
});

describe("api error handling", () => {
  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      })
    );
    await expect(api.listProjects()).rejects.toThrow("Internal Server Error");
  });

  it("returns body on 422 without throwing", async () => {
    const errBody = { errors: ["invalid"] };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: () => Promise.resolve(errBody),
      })
    );
    const result = await api.listProjects();
    expect(result).toEqual(errBody);
  });
});
