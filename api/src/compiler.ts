import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { buildOutDir, projectDir } from "./storage";

export interface CompileResult {
  ok: boolean;
  log: string;
}

export type Engine = "auto" | "pdflatex" | "xelatex" | "lualatex";

// latexmk engine flag per TeX engine
const ENGINE_FLAG: Record<Exclude<Engine, "auto">, string> = {
  pdflatex: "-pdf",
  xelatex: "-pdfxe",
  lualatex: "-pdflua",
};

type RealEngine = Exclude<Engine, "auto">;

export function engineFromMagic(source: string): RealEngine | null {
  const m = source.match(/%\s*!TE?X\s+(?:TS-)?program\s*=\s*(\w+)/i);
  const prog = m?.[1]?.toLowerCase();
  if (prog === "xelatex" || prog === "xetex") return "xelatex";
  if (prog === "lualatex" || prog === "luatex") return "lualatex";
  if (prog === "pdflatex" || prog === "latex") return "pdflatex";
  return null;
}

async function resolveEngine(mainAbs: string, setting: Engine): Promise<string> {
  if (setting !== "auto") return ENGINE_FLAG[setting];
  let magic: RealEngine | null = null;
  try {
    const head = (await fs.readFile(mainAbs, "utf8")).slice(0, 4000);
    magic = engineFromMagic(head);
  } catch {
    /* ignore */
  }
  return ENGINE_FLAG[magic ?? "pdflatex"];
}

export async function compile(
  projectId: string,
  mainAbs: string,
  opts: { shellEscape?: boolean; engine?: Engine } = {}
): Promise<CompileResult> {
  const outDir = buildOutDir(projectId);
  await fs.mkdir(outDir, { recursive: true });

  const engineFlag = await resolveEngine(mainAbs, opts.engine ?? "auto");

  const args = [
    engineFlag,
    "-interaction=nonstopmode",
    "-halt-on-error",
    "-file-line-error",
    `-outdir=${outDir}`,
  ];
  if (opts.shellEscape) args.push("-shell-escape");
  args.push(path.basename(mainAbs));

  return new Promise((resolve) => {
    const child = spawn("latexmk", args, {
      cwd: projectDir(projectId),
      env: { ...process.env },
    });

    let log = "";
    child.stdout.on("data", (d) => (log += d.toString()));
    child.stderr.on("data", (d) => (log += d.toString()));

    child.on("error", (err) =>
      resolve({ ok: false, log: `failed to spawn latexmk: ${err.message}` })
    );
    child.on("close", (code) => resolve({ ok: code === 0, log }));
  });
}
