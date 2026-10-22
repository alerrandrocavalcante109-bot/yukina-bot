/**
 * Yukina Bot
 * Repo: yukina-bot  |  Painel web: repo yukina (Pages)
 *
 * - Health HTTP (Render)
 * - Discord online
 * - /painel e Ypainel → link do painel
 * - SIGTERM NÃO encerra o processo (evita derrubar a sessão no deploy race)
 */
require("dotenv").config();

const http = require("node:http");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  Partials,
} = require("discord.js");

const TOKEN = String(process.env.DISCORD_TOKEN || "").trim();
const PORT = Number(process.env.PORT || 10000);
const PANEL_URL = (
  process.env.PANEL_URL ||
  "https://yukina-6uo.pages.dev/configuracoes-servidor.html"
).trim();
const GUILD_ID = String(
  process.env.DISCORD_GUILD_ID || process.env.GUILD_ID || ""
).trim();

if (!TOKEN) {
  console.error("[Yukina-Bot] DISCORD_TOKEN ausente nas Environment Variables.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const painelCommand = new SlashCommandBuilder()
  .setName("painel")
  .setDescription("Abre as configurações deste servidor no painel web da Yukina.")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

function buildPanelUrl(guildId, guildName) {
  const url = new URL(PANEL_URL);
  url.searchParams.set("guild", String(guildId));
  url.searchParams.set("name", guildName || "Servidor");
  return url.toString();
}

async function handlePainelSlash(interaction) {
  if (!interaction.inGuild() || !interaction.guildId) {
    return interaction.reply({
      content: "❄️ Use este comando dentro de um servidor Discord.",
      flags: MessageFlags.Ephemeral,
    });
  }
  if (
    !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) &&
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  ) {
    return interaction.reply({
      content:
        "🔒 Você precisa da permissão **Gerenciar servidor** para abrir este painel.",
      flags: MessageFlags.Ephemeral,
    });
  }
  const link = buildPanelUrl(interaction.guildId, interaction.guild?.name);
  return interaction.reply({
    content: [
      "❄️ **Painel de Configurações da Yukina**",
      "Abra o painel para gerenciar as configurações deste servidor:",
      "",
      "🔗 " + link,
    ].join("\n"),
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

async function handlePainelPrefix(message) {
  if (!message.guild || !message.guildId) {
    return message.reply("❄️ Use este comando dentro de um servidor Discord.");
  }
  const perms = message.member?.permissions;
  if (
    !perms?.has(PermissionFlagsBits.ManageGuild) &&
    !perms?.has(PermissionFlagsBits.Administrator)
  ) {
    return message.reply(
      "🔒 Você precisa da permissão **Gerenciar servidor** para abrir este painel."
    );
  }
  const link = buildPanelUrl(message.guildId, message.guild.name);
  return message.reply({
    content:
      "❄️ **Painel de Configurações da Yukina**\nAbra o painel para gerenciar as configurações deste servidor:\n\n🔗 " +
      link,
    allowedMentions: { parse: [] },
  });
}

// ── Health HTTP (Render exige porta aberta) ──────────────────────────
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(
    JSON.stringify({
      ok: true,
      service: "yukina-bot",
      ready: Boolean(client.isReady && client.isReady()),
      user: client.user ? client.user.tag : null,
      panel: PANEL_URL,
    })
  );
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("[Yukina-Bot] Health HTTP na porta " + PORT);
});

// ── Discord ─────────────────────────────────────────────────────────
async function onReady() {
  console.log("");
  console.log("❄️  Yukina Bot online: " + (client.user && client.user.tag));
  console.log("🏠 Servidores: " + client.guilds.cache.size);
  console.log("🔗 Painel: " + PANEL_URL);
  console.log("");

  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    const body = [painelCommand.toJSON()];
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), {
        body,
      });
      console.log("[Slash] /painel no servidor " + GUILD_ID);
    } else {
      await rest.put(Routes.applicationCommands(client.user.id), { body });
      console.log("[Slash] /painel global (pode demorar até ~1h)");
    }
  } catch (err) {
    console.error("[Slash] Falha ao registrar:", err && err.message ? err.message : err);
  }
}

client.once("clientReady", onReady);
client.once("ready", () => {
  if (client.isReady && client.isReady()) client.emit("clientReady");
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "painel") return;
  try {
    await handlePainelSlash(interaction);
  } catch (error) {
    console.error("[Painel] Erro slash:", error);
    const payload = {
      content: "🫧 Não consegui abrir o painel agora.",
      flags: MessageFlags.Ephemeral,
    };
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
      else await interaction.reply(payload);
    } catch (_) {}
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!/^[Yy]painel(\s|$)/.test(message.content.trim())) return;
  try {
    await handlePainelPrefix(message);
  } catch (error) {
    console.error("[Painel] Erro prefixo:", error);
  }
});

client.on("error", (err) => {
  console.error("[Discord] error:", err && err.message ? err.message : err);
});

client.on("shardDisconnect", (event, id) => {
  console.warn("[Discord] shardDisconnect", id, event && event.code);
});

client.on("shardReconnecting", (id) => {
  console.log("[Discord] reconectando shard", id);
});

console.log("[Yukina-Bot] Conectando ao Discord...");
client
  .login(TOKEN)
  .then(() => console.log("[Yukina-Bot] Login aceito; aguardando ready..."))
  .catch((err) => {
    console.error("[Yukina-Bot] Falha no login:", err && err.message ? err.message : err);
    process.exit(1);
  });

// SIGTERM: NÃO chama process.exit — mantém o bot online.
// O Render só mata de verdade com SIGKILL se precisar trocar a instância.
process.on("SIGTERM", () => {
  console.warn("[Yukina-Bot] SIGTERM recebido e ignorado (mantém sessão Discord).");
});
process.on("SIGINT", () => {
  console.warn("[Yukina-Bot] SIGINT recebido e ignorado.");
});

process.on("unhandledRejection", (r) => {
  console.error("[Yukina-Bot] unhandledRejection:", r);
});
