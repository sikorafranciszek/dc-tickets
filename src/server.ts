import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { router as apiRouter, publicRouter } from "./routes.js";
import { CFG } from "./config.js";
import helmet from "helmet";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function startServer() {
  const app = express();
  app.use(helmet());

  // EJS
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));

  app.use(express.json());

  // PUBLICZNE strony (bez x-api-key): /ticket/:id
  app.use("/", publicRouter);

  // API (z x-api-key): /api/*
  app.use("/api", apiRouter);

  // 404 middleware
  app.use((req, res) => {
    res.status(404).json({ status: 404, error: "Not found" });
  });

  app.listen(CFG.http.port, () => {
    console.log(`🌐 Express nasłuchuje na :${CFG.http.port}`);
  });
}
