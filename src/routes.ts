import { Router } from 'express';
import { CFG } from './config';
import { prisma } from './prisma';

export const router = Router()

router.use((req, res, next) => {
    const key = req.headers['x-api-key'];
    if (key !== CFG.http.apiKey) {
        return res.status(403).json({ error: 'unauthorized' });
    }
    next();
})

router.get('/health', (_req, res) => {
    res.json({ ok: true });
})

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