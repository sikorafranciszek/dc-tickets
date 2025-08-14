import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  GatewayIntentBits,
  GuildMember,
  Partials,
  PermissionFlagsBits,
  TextChannel,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type OverwriteResolvable,
} from "discord.js";
import { prisma } from "./prisma";
import { CFG } from "./config";

const BUTTON_OPEN_ID = "ticket_open_btn";
// nowe ID:
const BUTTON_CLOSE_NOP_ID = "ticket_close_nop";
const BUTTON_CLOSE_WITH_ID = "ticket_close_with";
const MODAL_CLOSE_REASON_ID = "ticket_close_reason_modal";

/* -------------------------- helpers -------------------------- */

function parseRoleIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string" && raw.trim().length) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter(Boolean);
    } catch {
      if ((raw as string).includes(",")) return (raw as string).split(",").map(s => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function stringifyRoleIds(ids: string[]): string {
  return JSON.stringify(Array.from(new Set(ids))); // dedup
}

async function getManagerRoles(guildId: string): Promise<string[]> {
  const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
  const fromDb = parseRoleIds(cfg?.managerRoleIds);
  return fromDb.length ? fromDb : CFG.discord.defaultManagerRoleIds;
}

async function isManagerMember(member: GuildMember): Promise<boolean> {
  const managerRoles = await getManagerRoles(member.guild.id);
  return managerRoles.some((id) => member.roles.cache.has(id));
}

/* -------------------------- UI builders -------------------------- */

export function buildOpenPanel() {
  const btn = new ButtonBuilder()
    .setCustomId(BUTTON_OPEN_ID)
    .setLabel("📨 Utwórz ticket")
    .setStyle(ButtonStyle.Primary);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
}

export function buildCloseRow() {
  const btnNo = new ButtonBuilder()
    .setCustomId(BUTTON_CLOSE_NOP_ID)
    .setLabel("🔒 Zamknij (bez powodu)")
    .setStyle(ButtonStyle.Secondary);

  const btnWith = new ButtonBuilder()
    .setCustomId(BUTTON_CLOSE_WITH_ID)
    .setLabel("📝 Zamknij z powodem")
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(btnNo, btnWith);
}

function buildCloseReasonModal() {
  const modal = new ModalBuilder()
    .setCustomId(MODAL_CLOSE_REASON_ID)
    .setTitle("Powód zamknięcia ticketu");

  const reason = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Powód (wymagany)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  return modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reason));
}

/* -------------------------- client -------------------------- */

export function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel],
  });

  client.once("ready", () => {
    console.log(`Zalogowano jako ${client.user?.tag}`);
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === "tickets") {
        const sub = interaction.options.getSubcommand();
        if (sub === "setup-panel") return handleSetupTickets(interaction);
        if (sub === "add-role")     return handleAddRole(interaction);
        if (sub === "remove-role")  return handleRemoveRole(interaction);
        if (sub === "list-roles")   return handleListRoles(interaction);
      } else if (interaction.isButton()) {
        if (interaction.customId === BUTTON_OPEN_ID)        return handleOpenTicket(interaction);
        if (interaction.customId === BUTTON_CLOSE_NOP_ID)   return handleCloseTicket(interaction, { withReason: false });
        if (interaction.customId === BUTTON_CLOSE_WITH_ID)  return handleOpenCloseReasonModal(interaction);
      } else if (interaction.isModalSubmit() && interaction.customId === MODAL_CLOSE_REASON_ID) {
        return handleCloseTicketWithReason(interaction);
      }
    } catch (err) {
      console.error(err);
      if (interaction.isRepliable()) {
        await interaction.reply({
          content: "Wystąpił błąd podczas przetwarzania interakcji.",
          ephemeral: true,
        }).catch(() => {});
      }
    }
  });

  return client;
}

/* -------------------------- commands -------------------------- */

async function handleSetupTickets(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId || !interaction.guild) {
    return interaction.reply({ content: "Użyj na serwerze.", ephemeral: true });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!(await isManagerMember(member))) {
    return interaction.editReply("Nie masz uprawnień do skonfigurowania systemu ticketów.");
  }

  const ch = await interaction.guild.channels.fetch(CFG.discord.panelChannelId).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildText) {
    return interaction.editReply("Nieprawidłowy PANEL_CHANNEL_ID (to nie jest kanał tekstowy).");
  }

  const me = interaction.guild.members.me;
  const perms = me ? (ch as TextChannel).permissionsFor(me) : null;
  const needed = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
  ];
  const missing = needed.filter(p => !perms?.has(p));
  if (missing.length) {
    return interaction.editReply("Bot nie ma uprawnień do kanału panelu (wymagane: ViewChannel, SendMessages, EmbedLinks, AttachFiles).");
  }

  await (ch as TextChannel).send({
    content: "Kliknij, aby utworzyć ticket:",
    components: [buildOpenPanel()],
  });

  await interaction.editReply("✅ Panel opublikowany.");
}

async function handleListRoles(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const roles = await getManagerRoles(interaction.guildId);
  if (!roles.length) return interaction.editReply("Brak skonfigurowanych ról managerów.");
  return interaction.editReply(`📋 Role obsługujące tickety:\n${roles.map(id => `<@&${id}>`).join("\n")}`);
}

async function handleAddRole(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const member = await interaction.guild!.members.fetch(interaction.user.id);
  if (!(await isManagerMember(member))) {
    return interaction.editReply("Nie masz uprawnień do dodawania ról.");
  }

  const role = interaction.options.getRole("role", true);
  const guildId = interaction.guildId;

  const existing = await prisma.guildConfig.findUnique({ where: { guildId } });
  const current = parseRoleIds(existing?.managerRoleIds);
  if (current.includes(role.id)) {
    return interaction.editReply(`Rola ${role} jest już na liście.`);
  }

  const updated = stringifyRoleIds([...current, role.id]);

  await prisma.guildConfig.upsert({
    where: { guildId },
    create: { guildId, managerRoleIds: updated },
    update: { managerRoleIds: updated },
  });

  return interaction.editReply(`✅ Dodano rolę ${role} do listy managerów.`);
}

async function handleRemoveRole(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const member = await interaction.guild!.members.fetch(interaction.user.id);
  if (!(await isManagerMember(member))) {
    return interaction.editReply("Nie masz uprawnień do usuwania ról.");
  }

  const role = interaction.options.getRole("role", true);
  const guildId = interaction.guildId;

  const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
  const current = parseRoleIds(cfg?.managerRoleIds);

  if (!current.length) {
    return interaction.editReply("⚠️ Brak ustawień ról dla tej gildii.");
  }

  const newRoles = current.filter((id) => id !== role.id);
  await prisma.guildConfig.update({
    where: { guildId },
    data: { managerRoleIds: stringifyRoleIds(newRoles) },
  });

  return interaction.editReply(`✅ Usunięto rolę ${role} z listy managerów.`);
}

/* -------------------------- tworzenie ticketu -------------------------- */

const ticketRateLimit = new Map<string, number>(); // userId -> timestamp

async function handleOpenTicket(interaction: ButtonInteraction) {
  if (!interaction.guildId || !interaction.guild) {
    return interaction.reply({ content: "Użyj na serwerze.", ephemeral: true });
  }

  const now = Date.now();
  const lastTicketTs = ticketRateLimit.get(interaction.user.id) || 0;
  if (now - lastTicketTs < 60_000) {
    const wait = Math.ceil((60_000 - (now - lastTicketTs)) / 1000);
    return interaction.reply({
      content: `⏳ Możesz utworzyć nowy ticket za ${wait}s.`,
      ephemeral: true,
    });
  }
  ticketRateLimit.set(interaction.user.id, now);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const existing = await prisma.ticket.findFirst({
    where: {
      openerId: interaction.user.id,
      guildId: interaction.guildId,
      status: "OPEN",
    },
  });

  if (existing) {
    return interaction.editReply({
      content: `Masz już otwarty ticket: <#${existing.channelId}>`,
    });
  }

  const lastTicket = await prisma.ticket.findFirst({
    where: { guildId: interaction.guildId },
    orderBy: { number: "desc" },
    select: { number: true },
  });

  const nextNumber = (lastTicket?.number ?? 0) + 1;
  const name = `ticket-${nextNumber.toString().padStart(4, "0")}`;

  const managerRoles = await getManagerRoles(interaction.guildId);

  const overwrites: OverwriteResolvable[] = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    ...managerRoles.map((roleId) => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    })),
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ];

  const channel = await interaction.guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: CFG.discord.ticketsCategoryId,
    permissionOverwrites: overwrites,
  });

  const ticket = await prisma.ticket.create({
    data: {
      number: nextNumber,
      guildId: interaction.guildId,
      channelId: channel.id,
      openerId: interaction.user.id,
    },
  });

  await (channel as TextChannel).send({
    content:
      `👋 Witaj <@${interaction.user.id}>! To jest Twój ticket **#${ticket.number}**.\n` +
      `Obsługą zajmą się: ${managerRoles.map((id) => `<@&${id}>`).join(", ")}\n\n` +
      `Gdy sprawa zakończona, użyj jednego z przycisków poniżej:`,
    components: [buildCloseRow()],
  });

  await interaction.editReply(`✅ Ticket utworzony: <#${channel.id}>`);
}

/* -------------------------- zamykanie -------------------------- */

async function handleOpenCloseReasonModal(interaction: ButtonInteraction) {
  if (!interaction.guildId) return;
  const member = await interaction.guild!.members.fetch(interaction.user.id);
  if (!(await isManagerMember(member))) {
    return interaction.reply({ content: "Nie masz uprawnień do zamknięcia ticketu.", ephemeral: true });
  }
  await interaction.showModal(buildCloseReasonModal());
}

async function handleCloseTicket(interaction: ButtonInteraction, opts: { withReason: boolean }) {
  if (!interaction.guildId) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channelId = interaction.channelId;
  const ticket = await prisma.ticket.findFirst({ where: { channelId } });
  if (!ticket || ticket.status === "CLOSED") {
    return interaction.editReply("Ten ticket jest już zamknięty lub nie istnieje w DB.");
  }

  // tylko whitelist – autor NIE może zamykać
  const member = await interaction.guild!.members.fetch(interaction.user.id);
  if (!(await isManagerMember(member))) {
    return interaction.editReply("Nie masz uprawnień do zamknięcia tego ticketu.");
  }

  const reason = opts.withReason ? "(brak powodu)" : undefined;
  await doCloseFlow({ interaction, ticketId: ticket.id, channelId, closerId: interaction.user.id, reason });
  await interaction.editReply("✅ Zamknięto ticket.");
}

async function handleCloseTicketWithReason(interaction: any /* ModalSubmitInteraction */) {
  if (!interaction.guildId) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channelId = interaction.channelId;
  const ticket = await prisma.ticket.findFirst({ where: { channelId } });
  if (!ticket || ticket.status === "CLOSED") {
    return interaction.editReply("Ten ticket jest już zamknięty lub nie istnieje w DB.");
  }

  const member = await interaction.guild!.members.fetch(interaction.user.id);
  if (!(await isManagerMember(member))) {
    return interaction.editReply("Nie masz uprawnień do zamknięcia tego ticketu.");
  }

  const reason = interaction.fields.getTextInputValue("reason")?.trim() || "(brak powodu)";
  await doCloseFlow({ interaction, ticketId: ticket.id, channelId, closerId: interaction.user.id, reason });
  await interaction.editReply("✅ Zamknięto ticket (z powodem).");
}

/* -------------------------- core close flow -------------------------- */

async function doCloseFlow(args: {
  interaction: ButtonInteraction | any;
  ticketId: string;
  channelId: string;
  closerId: string;
  reason?: string;
}) {
  const { interaction, ticketId, channelId, closerId, reason } = args;

  const channel = interaction.guild!.channels.cache.get(channelId) as TextChannel;

  // 1) zbierz wiadomości i wyrenderuj HTML
  const messages = await fetchAllMessages(channel, 1000);
  const html = renderTranscriptHtml(messages);

  // 2) zapisz transcript i update ticketu
  await prisma.$transaction([
    prisma.ticketTranscript.upsert({
      where: { ticketId },
      create: { ticketId, html },
      update: { html },
    }),
    prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "CLOSED", closedAt: new Date(), closedById: closerId, closeReason: reason },
    }),
  ]);

  // 3) zablokuj pisanie autorowi, zmień nazwę, napisz info
  const t = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!t) return;
  await channel.permissionOverwrites.edit(t.openerId, { SendMessages: false }).catch(() => {});
  await channel.setName(`closed-${(t.number ?? 0).toString().padStart(4, "0")}`).catch(() => {});
  await channel.send("🔒 Ticket zamknięty. Transkrypcja zapisana.");

  // 4) DM do autora i zamykającego
  const url = `${CFG.http.baseUrl}/ticket/${t.id}`;
  const openerUser = await interaction.client.users.fetch(t.openerId).catch(() => null);
  const closerUser = await interaction.client.users.fetch(closerId).catch(() => null);

  const authorMsg = reason
    ? `Twój ticket #${t.number} został zamknięty.\nPowód: ${reason}\nHistoria: ${url}`
    : `Twój ticket #${t.number} został zamknięty.\nHistoria: ${url}`;

  const closerMsg = reason
    ? `Zamknąłeś ticket #${t.number}.\nPowód: ${reason}\nHistoria: ${url}`
    : `Zamknąłeś ticket #${t.number}.\nHistoria: ${url}`;

  if (openerUser) await openerUser.send(authorMsg).catch(() => {});
  if (closerUser) await closerUser.send(closerMsg).catch(() => {});

  // 5) usuń kanał
  await channel.delete("Ticket zamknięty – usuwam kanał po archiwizacji.").catch(() => {});
}

/* -------------------------- transcript utils -------------------------- */

async function fetchAllMessages(channel: TextChannel, max: number) {
  const all: any[] = [];
  let before: string | undefined = undefined;

  while (all.length < max) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (batch.size === 0) break;
    const arr = Array.from(batch.values());
    all.push(...arr);
    before = arr[arr.length - 1].id;
    if (batch.size < 100) break;
  }
  all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  return all.slice(0, max);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]!));
}

function renderTranscriptHtml(messages: any[]): string {
  const rows = messages.map(m => {
    const time = new Date(m.createdTimestamp).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
    const author = m.author ? `${escapeHtml(m.author.tag)} (${m.author.id})` : "Unknown";
    const content = m.content ? escapeHtml(m.content) : "";
    const attachments = Array.from(m.attachments?.values?.() || []);
    const parts: string[] = [];
    if (content) parts.push(`<pre>${content}</pre>`);
    if (attachments.length) {
      parts.push(
        `<div>Załączniki: ${attachments
          .map((a: any) => `<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${escapeHtml(a.name)}</a>`)
          .join(", ")}</div>`
      );
    }
    return `<div class="msg"><span class="who">${author}</span><span class="time"> — ${time}</span><div class="content">${parts.join("") || "<i>(brak treści)</i>"}</div></div>`;
  });
  return rows.join("\n");
}
