import { Router } from "express";
import { pool } from "../db";
import { DEFAULT_MAIN, MAIN_PATH } from "../template";
import { uniqueProjectName } from "../utils/uniqueName";

export const projects = Router();

// List projects ordered by manual sort, then newest first
projects.get("/", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, main_path, shell_escape, engine, created_at, updated_at FROM projects ORDER BY sort_order ASC, updated_at DESC`
  );
  res.json(rows);
});

// Reorder projects: assigns sort_order 0,1,2… by the submitted ids array
projects.post("/reorder", async (req, res) => {
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: "ids[] required" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < ids.length; i++) {
      await client.query(`UPDATE projects SET sort_order = $1 WHERE id = $2`, [i, ids[i]]);
    }
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// Create project. Seeds a default main.tex unless `seed: false` (e.g. imports
// that bring their own files).
projects.post("/", async (req, res) => {
  const baseName = (req.body?.name || "Untitled Project").toString().slice(0, 200);
  const seed = req.body?.seed !== false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const name = await uniqueProjectName(client, baseName);
    const { rows } = await client.query(
      `INSERT INTO projects (name, sort_order)
       VALUES ($1, (SELECT COALESCE(MIN(sort_order), 0) - 1 FROM projects))
       RETURNING id, name, main_path, shell_escape, engine, created_at, updated_at`,
      [name]
    );
    const project = rows[0];
    if (seed) {
      await client.query(
        `INSERT INTO files (project_id, path, content) VALUES ($1, $2, $3)`,
        [project.id, MAIN_PATH, DEFAULT_MAIN]
      );
    }
    await client.query("COMMIT");
    res.status(201).json(project);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// Rename and/or set the main entry file (COALESCE keeps unspecified fields)
projects.patch("/:id", async (req, res) => {
  const rawName =
    req.body?.name != null ? req.body.name.toString().slice(0, 200) : null;
  const mainPath =
    req.body?.main_path != null ? req.body.main_path.toString() : null;
  const shellEscape =
    req.body?.shell_escape != null ? !!req.body.shell_escape : null;
  const allowedEngines = ["auto", "pdflatex", "xelatex", "lualatex"];
  const engine =
    req.body?.engine != null && allowedEngines.includes(req.body.engine)
      ? req.body.engine
      : null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const name = rawName !== null
      ? await uniqueProjectName(client, rawName, req.params.id)
      : null;
    const { rows } = await client.query(
      `UPDATE projects
         SET name = COALESCE($1, name),
             main_path = COALESCE($2, main_path),
             shell_escape = COALESCE($3, shell_escape),
             engine = COALESCE($4, engine),
             updated_at = now()
       WHERE id = $5
       RETURNING id, name, main_path, shell_escape, engine, created_at, updated_at`,
      [name, mainPath, shellEscape, engine, req.params.id]
    );
    await client.query("COMMIT");
    if (!rows[0]) return res.status(404).json({ error: "not found" });
    res.json(rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

// Delete
projects.delete("/:id", async (req, res) => {
  await pool.query(`DELETE FROM projects WHERE id = $1`, [req.params.id]);
  res.status(204).end();
});

// List files. Binary blobs are not inlined — only metadata + text content.
projects.get("/:id/files", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT path,
            CASE WHEN is_binary THEN NULL ELSE content END AS content,
            is_binary,
            updated_at
       FROM files WHERE project_id = $1 ORDER BY path`,
    [req.params.id]
  );
  res.json(rows);
});

// Upload a binary asset (image, etc.) as base64. path relative to project root.
projects.post("/:id/upload", async (req, res) => {
  const filePath = (req.body?.path || "").toString();
  const base64 = (req.body?.data || "").toString();
  if (!filePath || !base64)
    return res.status(400).json({ error: "missing path or data" });

  const buf = Buffer.from(base64, "base64");
  await pool.query(
    `INSERT INTO files (project_id, path, data, is_binary, content)
     VALUES ($1, $2, $3, true, '')
     ON CONFLICT (project_id, path)
     DO UPDATE SET data = EXCLUDED.data, is_binary = true, updated_at = now()`,
    [req.params.id, filePath, buf]
  );
  await pool.query(`UPDATE projects SET updated_at = now() WHERE id = $1`, [
    req.params.id,
  ]);
  res.status(201).json({ ok: true, path: filePath });
});

// Batch upload many files at once (folder / drag-and-drop). Each item carries
// either text `content` or base64 `data` (binary). Paths keep folder structure.
projects.post("/:id/files/batch", async (req, res) => {
  const items = Array.isArray(req.body?.files) ? req.body.files : null;
  if (!items) return res.status(400).json({ error: "files[] required" });
  if (items.length > 500)
    return res.status(413).json({ error: "too many files (max 500)" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let count = 0;
    for (const it of items) {
      const filePath = (it?.path || "").toString();
      if (!filePath) continue;
      if (typeof it.data === "string") {
        const buf = Buffer.from(it.data, "base64");
        await client.query(
          `INSERT INTO files (project_id, path, data, is_binary, content)
           VALUES ($1, $2, $3, true, '')
           ON CONFLICT (project_id, path)
           DO UPDATE SET data = EXCLUDED.data, is_binary = true,
                         content = '', updated_at = now()`,
          [req.params.id, filePath, buf]
        );
      } else {
        await client.query(
          `INSERT INTO files (project_id, path, content, is_binary, data)
           VALUES ($1, $2, $3, false, NULL)
           ON CONFLICT (project_id, path)
           DO UPDATE SET content = EXCLUDED.content, is_binary = false,
                         data = NULL, updated_at = now()`,
          [req.params.id, filePath, (it.content ?? "").toString()]
        );
      }
      count++;
    }
    await client.query(`UPDATE projects SET updated_at = now() WHERE id = $1`, [
      req.params.id,
    ]);
    await client.query("COMMIT");
    res.status(201).json({ ok: true, count });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
};

// Serve a binary asset (for previewing images/PDFs in the UI)
projects.get("/:id/asset/*", async (req, res) => {
  const filePath = decodeURIComponent((req.params as any)[0] || "");
  const { rows } = await pool.query(
    `SELECT data FROM files WHERE project_id = $1 AND path = $2 AND is_binary`,
    [req.params.id, filePath]
  );
  if (!rows[0]?.data) return res.status(404).json({ error: "not found" });
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
  res.send(rows[0].data);
});

// Upsert a file (autosave). path is URL-encoded.
projects.put("/:id/files/*", async (req, res) => {
  const filePath = decodeURIComponent((req.params as any)[0] || "");
  const content = (req.body?.content ?? "").toString();
  if (!filePath) return res.status(400).json({ error: "missing path" });

  await pool.query(
    `INSERT INTO files (project_id, path, content)
     VALUES ($1, $2, $3)
     ON CONFLICT (project_id, path)
     DO UPDATE SET content = EXCLUDED.content, updated_at = now()`,
    [req.params.id, filePath, content]
  );
  await pool.query(`UPDATE projects SET updated_at = now() WHERE id = $1`, [
    req.params.id,
  ]);
  res.json({ ok: true });
});

// Delete a file
projects.delete("/:id/files/*", async (req, res) => {
  const filePath = decodeURIComponent((req.params as any)[0] || "");
  await pool.query(`DELETE FROM files WHERE project_id = $1 AND path = $2`, [
    req.params.id,
    filePath,
  ]);
  res.status(204).end();
});
