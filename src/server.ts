import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";
import crypto from "crypto";
import { router as apiRouter, publicRouter } from "./routes.js";
import { CFG } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function startServer() {
  const app = express();

  // Nonce per-request do CSP (dla inline tailwind.config)
  app.use((req, res, next) => {
    const nonce = crypto.randomBytes(16).toString("base64");
    res.locals.cspNonce = nonce;
    next();
  });

  // Helmet + CSP zezwalające na tailwind CDN i inline (nonce)
  app.use(
    helmet({
      // Przy HTTP (IP:3000) COOP/COEP wywołują warningi — wyłączamy.
      crossOriginOpenerPolicy: false,
      crossOriginEmbedderPolicy: false,

      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          // pozwalamy na CDN + inline przez nonce
          "script-src": [
            "'self'",
            (req, res) => `'nonce-${res.locals.cspNonce}'`,
            "https://cdn.tailwindcss.com",
          ],
          // tailwind wstrzykuje <style>; potrzebne 'unsafe-inline'
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:", "https:"],
          "font-src": ["'self'", "data:"],
          "connect-src": ["'self'"],
          "object-src": ["'none'"],
          "base-uri": ["'self'"],
          "frame-ancestors": ["'self'"],
        },
      },
    })
  );

  // EJS
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));

  app.use(express.json());

  // statyki (jeśli używasz lokalnego CSS/assetów)
  app.use("/assets", express.static(path.join(__dirname, "..", "public", "assets"), {
    maxAge: "7d",
    immutable: true,
  }));

  // PUBLICZNE strony (bez x-api-key)
  app.use("/", publicRouter);

  // API (z x-api-key)
  app.use("/api", apiRouter);

  app.use((req, res) => {
    res.status(404).json({ status: 404, error: "Not found" });
  });

  app.listen(CFG.http.port, () => {
    console.log(`🌐 Express nasłuchuje na :${CFG.http.port}`);
  });
}
