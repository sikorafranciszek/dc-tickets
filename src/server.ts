import express from "express";
import { router } from "./routes";
import { CFG } from "./config";
import helmet from "helmet";

export function startServer() {
  const app = express();
  app.use(express.json());
  app.use(helmet());
  app.use("/api", router);

  // 404 middleware
  app.use((req, res, next) => {
    res.status(404).json({ status: 404, error: "Not found" });
  });

  app.listen(CFG.http.port, () => {
    console.log(`🌐 Express nasłuchuje na :${CFG.http.port}`);
  });
}
