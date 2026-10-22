/**
 * Yukina Bot
 * Repo: yukina-bot  |  Painel: yukina (Pages)
 */
require("dotenv").config();

const http = require("node:http");
const https = require("node:https");
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

function cleanToken(raw) {
  let t = String(raw || "").trim();
  // Remove aspas que às vezes colam no Render
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  // Remove prefixo "Bot " se alguém colou errado
  if (t.toLowerCase().startsWith("bot ")) t = t.slice(4).trim();
  return t;
}

const TOKEN = cleanToken(process.env.DISCORD_TOKEN);
const PORT = Number(process.env.PORT || 10000);
const PANEL_URL = (
  process.env.PANEL_URL ||
  "https://yukina-6uo.pages.dev/configuracoes-servidor.html"
).trim();
const GUILD_ID = String(
  process.env.DISCORD_GUILD_ID || process.env.GUILD_ID || ""
).trim();

if (!TOKEN) {
  console.error("[Yukina-Bot] DISCORD_TOKEN ausente.");
  process.exit(1);
}

console.log(
  "[Yukina-Bot] Token length=" +
    TOKEN.length +
    " | começa com=" +
    TOKEN.slice(0, 8) +
    "..."
);

function httpJson(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try {
          json = body ? JSON.parse(body) : null;
        } catch (_) {}
        resolve({ status: res.statusCode, json, body });
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
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
      "❄️ **Painel de Configurações da Yukina**\nAbra o painel:\n\n🔗 " + link,
    allowedMentions: { parse: [] },
  });
}

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
      console.log("[Slash] /painel global (pode demorar ~1h)");
    }
  } catch (err) {
    console.error("[Slash] Falha:", err && err.message ? err.message : err);
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
    console.error("[Painel] Erro:", error);
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

process.on("SIGTERM", () => {
  console.warn("[Yukina-Bot] SIGTERM ignorado (mantém sessão Discord).");
});
process.on("SIGINT", () => {
  console.warn("[Yukina-Bot] SIGINT ignorado.");
});
process.on("unhandledRejection", (r) => {
  console.error("[Yukina-Bot] unhandledRejection:", r);
});

(async () => {
  try {
    console.log("[Yukina-Bot] Validando token na API Discord...");
    const me = await httpJson("https://discord.com/api/v10/users/@me", {
      Authorization: "Bot " + TOKEN,
      "User-Agent": "Yukina-Bot",
    });

    if (me.status === 401 || me.status === 403) {
      console.error(
        "[Yukina-Bot] TOKEN INVÁLIDO (HTTP " +
          me.status +
          "). Reset o token no Discord Developer Portal e atualize DISCORD_TOKEN no Render (sem aspas)."
      );
      // Mantém o health vivo para o Render não ficar em loop de crash
      return;
    }
    if (me.status === 429) {
      console.warn("[Yukina-Bot] Rate limit 429 na REST — tentando login mesmo assim...");
    } else if (me.status === 200 && me.json && me.json.username) {
      console.log(
        "[Yukina-Bot] Token OK: " +
          me.json.username +
          (me.json.discriminator && me.json.discriminator !== "0"
            ? "#" + me.json.discriminator
            : "") +
          " (id " +
          me.json.id +
          ")"
      );
    } else {
      console.warn("[Yukina-Bot] REST /users/@me HTTP " + me.status);
    }

    console.log("[Yukina-Bot] Conectando ao gateway...");
    const loginTimeout = setTimeout(() => {
      console.error(
        "[Yukina-Bot] Login não completou em 45s. Verifique token, intents e rede."
      );
    }, 45000);

    await client.login(TOKEN);
    clearTimeout(loginTimeout);
    console.log("[Yukina-Bot] Login aceito; aguardando ready...");
  } catch (err) {
    console.error(
      "[Yukina-Bot] Falha no login:",
      err && err.message ? err.message : err
    );
    if (String(err && err.message).includes("token") || err.code === "TokenInvalid") {
      console.error(
        "[Yukina-Bot] Gere um token NOVO no portal e cole em DISCORD_TOKEN no Render."
      );
    }
  }
})();
