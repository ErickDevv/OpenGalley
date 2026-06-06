import { Router } from "express";
import { pool } from "../db";
import { syncFilesToDisk, readPdf } from "../storage";
import { compile, Engine } from "../compiler";
import { MAIN_PATH } from "../template";

export const compileRouter = Router();

async function loadFiles(projectId: string) {
  const { rows } = await pool.query(
    `SELECT path, content, data, is_binary FROM files WHERE project_id = $1`,
    [projectId]
  );
  return rows as {
    path: string;
    content: string | null;
    data: Buffer | null;
    is_binary: boolean;
  }[];
}

async function projectSettings(
  projectId: string
): Promise<{ main_path: string; shell_escape: boolean; engine: Engine }> {
  const { rows } = await pool.query(
    `SELECT main_path, shell_escape, engine FROM projects WHERE id = $1`,
    [projectId]
  );
  const engine = rows[0]?.engine as Engine;
  return {
    main_path: rows[0]?.main_path || MAIN_PATH,
    shell_escape: !!rows[0]?.shell_escape,
    engine: ["auto", "pdflatex", "xelatex", "lualatex"].includes(engine)
      ? engine
      : "auto",
  };
}

// Compile project -> returns { ok, log }. PDF fetched separately via /pdf.
compileRouter.post("/:id/compile", async (req, res) => {
  const projectId = req.params.id;
  const settings = await projectSettings(projectId);
  const main = (req.body?.main || settings.main_path).toString();

  const files = await loadFiles(projectId);
  if (files.length === 0)
    return res.status(404).json({ error: "project has no files" });

  const { mainAbs } = await syncFilesToDisk(projectId, files, main);
  const result = await compile(projectId, mainAbs, {
    shellEscape: settings.shell_escape,
    engine: settings.engine,
  });
  res.status(result.ok ? 200 : 422).json(result);
});

// Download/preview the last compiled PDF
compileRouter.get("/:id/pdf", async (req, res) => {
  try {
    const pdf = await readPdf(projectId(req));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${projectId(req)}.pdf"`
    );
    res.send(pdf);
  } catch {
    res.status(404).json({ error: "no compiled pdf, compile first" });
  }
});

const projectId = (req: { params: { id: string } }) => req.params.id;
