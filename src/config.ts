export const CFG = {
  databaseUrl: process.env.DATABASE_URL!,
  discord: {
    token: process.env.DISCORD_TOKEN!,
    clientId: process.env.DISCORD_CLIENT_ID!,
    guildId: process.env.DISCORD_GUILD_ID!,
    // Fallback: jeśli w DB brak GuildConfig, użyj tego
    defaultManagerRoleIds: (process.env.MANAGER_ROLE_IDS || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean),
    ticketsCategoryId: process.env.TICKETS_CATEGORY_ID!,
    panelChannelId: process.env.PANEL_CHANNEL_ID!,
  },
  http: {
    port: Number(process.env.PORT || 3000),
    apiKey: process.env.API_KEY || "changeme",
    baseUrl: process.env.BASE_URL || "http://localhost:3000",
  }
};

for (const [k, v] of Object.entries(CFG.discord)) {
  if (!v || (Array.isArray(v) && !v.length && k !== "defaultManagerRoleIds")) {
    throw new Error(`Brak zmiennej .env dla ${k}`);
  }
}
