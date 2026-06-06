import express from "express";
import cors from "cors";
import { migrate } from "./db";
import { projects } from "./routes/projects";
import { compileRouter } from "./routes/compile";

async function main() {
  await migrate();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/projects", projects);
  app.use("/api/projects", compileRouter);

  // central error handler
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  );

  const port = Number(process.env.PORT || 4000);
  app.listen(port, () => console.log(`[api] listening on :${port}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
