import express from "express";
import { router } from "./routes";
import { CFG } from "./config";

export function startServer() {
  const app = express();
  app.use(express.json());
  app.use("/api", router);

  app.listen(CFG.http.port, () => {
    console.log(`🌐 Express nasłuchuje na :${CFG.http.port}`);
  });
}
