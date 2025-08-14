import "dotenv/config";
import { createClient } from "./bot.js";
import { startServer } from "./server.js";
import { CFG } from "./config.js";

async function main() {
  startServer();
  const client = createClient();
  await client.login(CFG.discord.token);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
