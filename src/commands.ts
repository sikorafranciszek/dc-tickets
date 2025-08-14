import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { CFG } from "./config";

const ticketsCmd = new SlashCommandBuilder()
.setName("tickets")
.setDescription("Zarządzaj zarządzaj ticketami")
.addSubcommand(sub =>
    sub.setName("setup-panel")
    .setDescription("Publikuje panel zakładania ticketów")
)
.addSubcommand(sub =>
    sub.setName("add-role")
    .setDescription("Dodaje role obsługującą tickety")
    .addRoleOption(opt => opt.setName("role").setDescription("Rola").setRequired(true))
)
.addSubcommand(sub =>
    sub.setName("remove-role")
    .setDescription("Usuwa rolę obsługującą tickety")
    .addRoleOption(opt => opt.setName("role").setDescription("Rola").setRequired(true))
)
.addSubcommand(sub =>
    sub.setName("list-roles")
    .setDescription("Wyświetla listę ról obsługujących tickety")
)

const commands = [ticketsCmd.toJSON()];

const rest = new REST({ version: '10' }).setToken(CFG.discord.token);

async function main() {
    await rest.put(
        Routes.applicationGuildCommands(CFG.discord.clientId, CFG.discord.guildId),
        { body: commands }
    )

    console.log("Komendy ticket managera zaktualizowane");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});