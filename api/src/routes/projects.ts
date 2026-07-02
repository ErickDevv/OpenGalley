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
