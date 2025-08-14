import { Router } from "express";
import { prisma } from "./prisma";
import { CFG } from "./config.js";

// PUBLICZNE ROUTES (bez API key)
export const publicRouter = Router();

publicRouter.get("/ticket/:id", async (req, res) => {
  const id = req.params.id;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { transcript: true }
  });

  if (!ticket || !ticket.transcript) {
    return res.status(404).send("Transkrypcja nie znaleziona.");
  }

  return res.render("ticket", {
    ticket,
    transcriptHtml: ticket.transcript.html,
    baseUrl: CFG.http.baseUrl
  });
});

// API (z x-api-key)
export const router = Router();

router.use((req, res, next) => {
  const key = req.header("x-api-key");
  if (key !== CFG.http.apiKey) return res.status(401).json({ error: "unauthorized" });
  next();
});

router.get("/health", (_req, res) => res.json({ ok: true }));

router.get("/tickets", async (req, res) => {
  const { status, guildId } = req.query as { status?: "OPEN" | "CLOSED"; guildId?: string };
  const where: any = {};
  if (status) where.status = status;
  if (guildId) where.guildId = guildId;

  const data = await prisma.ticket.findMany({
    where,
    orderBy: [{ createdAt: "desc" }]
  });
  res.json(data);
});

router.post("/tickets/:channelId/close", async (req, res) => {
  const { channelId } = req.params;
  const ticket = await prisma.ticket.findUnique({ where: { channelId } });
  if (!ticket) return res.status(404).json({ error: "not_found" });
  if (ticket.status === "CLOSED") return res.json(ticket);

  const updated = await prisma.ticket.update({
    where: { channelId },
    data: { status: "CLOSED", closedAt: new Date() }
  });
  res.json(updated);
});
