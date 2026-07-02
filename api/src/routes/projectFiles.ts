import { Router } from "express";
import { pool } from "../db";

export const projectFiles = Router();

// List files. Binary blobs are not inlined — only metadata + text content.
projectFiles.get("/:id/files", async (req, res) => {
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
projectFiles.post("/:id/upload", async (req, res) => {
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
projectFiles.post("/:id/files/batch", async (req, res) => {
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
projectFiles.get("/:id/asset/*", async (req, res) => {
  const filePath = decodeURIComponent((req.params as Record<string, string>)[0] || "");
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
projectFiles.put("/:id/files/*", async (req, res) => {
  const filePath = decodeURIComponent((req.params as Record<string, string>)[0] || "");
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

// Rename a file or folder. Body: { to: "new/path" }. If `from` matches no
// single file, treat it as a folder prefix and shift every file beneath it.
projectFiles.patch("/:id/files/*", async (req, res) => {
  const from = decodeURIComponent((req.params as Record<string, string>)[0] || "");
  const to = (req.body?.to ?? "").toString();
  if (!from || !to) return res.status(400).json({ error: "missing path" });
  if (from === to) return res.json({ ok: true, count: 0 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const fileResult = await client.query(
      `UPDATE files SET path = $1, updated_at = now()
       WHERE project_id = $2 AND path = $3
       RETURNING path`,
      [to, req.params.id, from]
    );
    let count = fileResult.rowCount ?? 0;
    if (count === 0) {
      const folderResult = await client.query(
        `UPDATE files SET path = $1 || right(path, -length($2::text)), updated_at = now()
         WHERE project_id = $3 AND left(path, length($2::text) + 1) = $2 || '/'
         RETURNING path`,
        [to, from, req.params.id]
      );
      count = folderResult.rowCount ?? 0;
    }
    if (count === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "not found" });
    }
    // Keep main_path pointing at the same file if it (or its folder) moved.
    await client.query(
      `UPDATE projects
         SET main_path = CASE
               WHEN main_path = $1 THEN $2
               WHEN left(main_path, length($1::text) + 1) = $1 || '/'
                 THEN $2 || right(main_path, -length($1::text))
               ELSE main_path
             END,
             updated_at = now()
       WHERE id = $3`,
      [from, to, req.params.id]
    );
    await client.query("COMMIT");
    res.json({ ok: true, count });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e && typeof e === "object" && "code" in e && e.code === "23505")
      return res.status(409).json({ error: "a file already exists at that path" });
    throw e;
  } finally {
    client.release();
  }
});

// Delete a file
projectFiles.delete("/:id/files/*", async (req, res) => {
  const filePath = decodeURIComponent((req.params as Record<string, string>)[0] || "");
  await pool.query(`DELETE FROM files WHERE project_id = $1 AND path = $2`, [
    req.params.id,
    filePath,
  ]);
  res.status(204).end();
});
