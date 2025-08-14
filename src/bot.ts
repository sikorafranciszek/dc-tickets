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
  type GuildTextBasedChannel,
  type OverwriteResolvable,
} from "discord.js";
import { prisma } from "./prisma";
import { CFG } from "./config";

const BUTTON_OPEN_ID = "ticket_open_btn";
const BUTTON_CLOSE_ID = "ticket_close_btn";

/* -------------------------- helpers -------------------------- */

function parseRoleIds(raw: unknown): string[] {
  // Dla MySQL trzymasz JSON jako string w kolumnie TEXT/VARCHAR
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string" && raw.trim().length) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter(Boolean);
    } catch {
      // jeśli ktoś kiedyś wpisał "123,456" zamiast JSON
      if (raw.includes(",")) return raw.split(",").map(s => s.trim()).filter(Boolean);
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
  const btn = new ButtonBuilder()
    .setCustomId(BUTTON_CLOSE_ID)
    .setLabel("🔒 Zamknij ticket")
    .setStyle(ButtonStyle.Danger);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
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
      // log diagnostyczny
      // console.log("interaction:", interaction.type, interaction.isChatInputCommand() ? interaction.commandName + "/" + interaction.options.getSubcommand(false) : interaction.isButton() ? interaction.customId : "");

      if (interaction.isChatInputCommand() && interaction.commandName === "tickets") {
        const sub = interaction.options.getSubcommand();
        if (sub === "setup-panel") return handleSetupTickets(interaction);
        if (sub === "add-role")     return handleAddRole(interaction);
        if (sub === "remove-role")  return handleRemoveRole(interaction);
        if (sub === "list-roles")   return handleListRoles(interaction);
      } else if (interaction.isButton()) {
        if (interaction.customId === BUTTON_OPEN_ID)  return handleOpenTicket(interaction);
        if (interaction.customId === BUTTON_CLOSE_ID) return handleCloseTicket(interaction);
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

  // sprawdź uprawnienia bota do kanału
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
  await interaction.deferReply({ ephemeral: true });

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

/* -------------------------- buttons -------------------------- */

async function handleOpenTicket(interaction: ButtonInteraction) {
  if (!interaction.guildId || !interaction.guild) {
    return interaction.reply({ content: "Użyj na serwerze.", ephemeral: true });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // sprawdź czy user już ma otwarty
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

  // numeracja
  const last = await prisma.ticket.findFirst({
    where: { guildId: interaction.guildId },
    orderBy: { number: "desc" },
    select: { number: true },
  });

  const nextNumber = (last?.number ?? 0) + 1;
  const name = `ticket-${nextNumber.toString().padStart(4, "0")}`;

  const managerRoles = await getManagerRoles(interaction.guildId);

  // uprawnienia kanału
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

  // utwórz kanał w kategorii
  const channel = await interaction.guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: CFG.discord.ticketsCategoryId,
    permissionOverwrites: overwrites,
  });

  // zapis do DB
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
      `Gdy sprawa zakończona, kliknij:`,
    components: [buildCloseRow()],
  });

  await interaction.editReply(`✅ Ticket utworzony: <#${channel.id}>`);
}

async function handleCloseTicket(interaction: ButtonInteraction) {
  if (!interaction.guildId) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channelId = interaction.channelId;
  const ticket = await prisma.ticket.findFirst({ where: { channelId } });

  if (!ticket || ticket.status === "CLOSED") {
    return interaction.editReply("Ten ticket jest już zamknięty lub nie istnieje w DB.");
  }

  const member = await interaction.guild!.members.fetch(interaction.user.id);
  const canManage =
    (await isManagerMember(member)) || ticket.openerId === interaction.user.id;

  if (!canManage) {
    return interaction.editReply("Nie masz uprawnień do zamknięcia tego ticketu.");
  }

  const channel = interaction.channel as GuildTextBasedChannel;

  await (channel as TextChannel).permissionOverwrites
    .edit(ticket.openerId, { SendMessages: false })
    .catch(() => {});
  await (channel as TextChannel)
    .setName(`closed-${ticket.number.toString().padStart(4, "0")}`)
    .catch(() => {});
  await channel.send("🔒 Ticket zamknięty.");

  await prisma.ticket.update({
    where: { channelId },
    data: { status: "CLOSED", closedAt: new Date() },
  });

  await interaction.editReply("✅ Zamknięto ticket.");
}
