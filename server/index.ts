/**
 * Express server skeleton (decision D1/D3).
 * - Dev: runs on 8787; vite dev server proxies /api here.
 * - Prod: also serves ../dist statically.
 * SECURITY: env values (ANTHROPIC_API_KEY etc.) are read server-side only and
 * must never be echoed in any response.
 */
import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApiRouter } from "./routes/index";

const PORT = Number(process.env.PORT) || 8787;
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

export function createApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api", createApiRouter());

  if (existsSync(distDir)) {
    app.use(express.static(distDir));
    // SPA fallback for non-API GET routes.
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  return app;
}

const app = createApp();
app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT} (AI_PROVIDER=${process.env.AI_PROVIDER ?? "mock"})`);
});
