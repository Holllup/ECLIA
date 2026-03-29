import http from "node:http";
import crypto from "node:crypto";
import { createRequire } from "node:module";

import {
  loadEcliaConfig,
  openaiCompatProfileRouteKey,
  anthropicProfileRouteKey,
  codexOAuthProfileRouteKey,
  type EcliaConfig
} from "@eclia/config";
import { HttpsProxyAgent } from "https-proxy-agent";
import { ProxyAgent, type Dispatcher } from "undici";

import { env, hasEnv, boolEnv, normalizeIdList, json, readJson, makeAdapterLogger } from "@eclia/gateway-client/utils";
import {
  guessGatewayUrl,
  getGatewayToken,
  resetGatewaySession,
  coerceStreamMode,
  runGatewayChat,
  fetchArtifactBytes,
  installProcessErrorHandlers,
  parseToolAccessMode
} from "@eclia/gateway-client";
import {
  type SendRequest,
  sessionIdForDiscord,
  originFromInteraction,
  originFromMessage,
  formatDiscordOutboundText,
  sendTextOrFile,
  createInteractionSendFn,
  createMessageSendFn,
  extractRefToRepoRelPath,
  makeOnRecordHandler
} from "./discord-format.js";

const log = makeAdapterLogger("discord");
const require = createRequire(import.meta.url);
const DISCORD_WS_PROXY_PATCH = Symbol.for("eclia.discord.wsProxyPatch");

type DiscordModule = typeof import("discord.js");
type DiscordProxyConfig = {
  url: string;
  source: string;
  displayUrl: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function guildIdsFromEnv(): string[] {
  const whitelist = env("DISCORD_GUILD_WHITELIST");
  const single = env("DISCORD_GUILD_ID");
  const multi = env("DISCORD_GUILD_IDS");
  const src = whitelist || multi || single;
  return normalizeIdList(src);
}

function userIdsFromEnv(): string[] {
  const whitelist = env("DISCORD_USER_WHITELIST");
  const single = env("DISCORD_USER_ID");
  const src = whitelist || single;
  return normalizeIdList(src);
}

function forceGlobalCommandsFromEnv(fallback: boolean): boolean {
  // Back-compat: ECLIA_DISCORD_KEEP_GLOBAL_COMMANDS previously meant "also keep global".
  // New behavior treats either env var as "force global registration only".
  if (hasEnv("ECLIA_DISCORD_FORCE_GLOBAL_COMMANDS")) return boolEnv("ECLIA_DISCORD_FORCE_GLOBAL_COMMANDS");
  if (hasEnv("ECLIA_DISCORD_KEEP_GLOBAL_COMMANDS")) return boolEnv("ECLIA_DISCORD_KEEP_GLOBAL_COMMANDS");
  return fallback;
}

function requirePrefixFromEnv(): boolean {
  if (hasEnv("ECLIA_DISCORD_REQUIRE_PREFIX")) return boolEnv("ECLIA_DISCORD_REQUIRE_PREFIX");
  // Back-compat: this flag previously enabled prefix mode.
  return boolEnv("ECLIA_DISCORD_ALLOW_MESSAGE_PREFIX");
}

function redactProxyUrl(proxyUrl: string): string {
  try {
    const u = new URL(proxyUrl);
    if (u.username) u.username = "***";
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return proxyUrl;
  }
}

function parseDiscordProxyCandidate(
  rawValue: string,
  source: string,
  opts?: { strict?: boolean; warnOnSkip?: boolean }
): DiscordProxyConfig | null {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    if (opts?.strict) {
      throw new Error(`Invalid Discord proxy URL from ${source}. Use an http:// or https:// proxy URL.`);
    }
    if (opts?.warnOnSkip) log.warn(`ignoring ${source}: invalid proxy URL`);
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    if (opts?.strict) {
      throw new Error(`Discord proxy URL from ${source} must use http:// or https://.`);
    }
    if (opts?.warnOnSkip) log.warn(`ignoring ${source}: only http:// and https:// proxies are supported`);
    return null;
  }

  return {
    url: parsed.toString(),
    source,
    displayUrl: redactProxyUrl(parsed.toString())
  };
}

function resolveDiscordProxy(rawDiscordCfg: { proxy_url?: string }): DiscordProxyConfig | null {
  return (
    parseDiscordProxyCandidate(env("ECLIA_DISCORD_PROXY_URL"), "ECLIA_DISCORD_PROXY_URL", { strict: true }) ??
    parseDiscordProxyCandidate(String(rawDiscordCfg.proxy_url ?? ""), "adapters.discord.proxy_url", { strict: true }) ??
    parseDiscordProxyCandidate(env("HTTPS_PROXY"), "HTTPS_PROXY", { warnOnSkip: true }) ??
    parseDiscordProxyCandidate(env("HTTP_PROXY"), "HTTP_PROXY", { warnOnSkip: true }) ??
    parseDiscordProxyCandidate(env("ALL_PROXY"), "ALL_PROXY", { warnOnSkip: true })
  );
}

function installDiscordWsProxyShim(proxy: DiscordProxyConfig): void {
  const wsModule = require("ws") as any;
  if (!wsModule || typeof wsModule.WebSocket !== "function") {
    throw new Error("Failed to install Discord WebSocket proxy shim: ws module is unavailable.");
  }

  const existing = wsModule[DISCORD_WS_PROXY_PATCH] as { url: string } | undefined;
  if (existing?.url === proxy.url) return;
  if (existing && existing.url !== proxy.url) {
    throw new Error("Discord WebSocket proxy shim is already installed with a different proxy URL.");
  }

  const OriginalWebSocket = wsModule.WebSocket;
  const proxyAgent = new HttpsProxyAgent(proxy.url);

  const ProxiedWebSocket = function (
    this: unknown,
    address: unknown,
    protocols?: unknown,
    options?: Record<string, unknown>
  ) {
    let nextProtocols = protocols;
    let nextOptions = options;

    if (protocols && typeof protocols === "object" && !Array.isArray(protocols)) {
      nextOptions = protocols as Record<string, unknown>;
      nextProtocols = undefined;
    }

    return new OriginalWebSocket(address, nextProtocols as any, {
      ...(nextOptions ?? {}),
      agent: (nextOptions as any)?.agent ?? proxyAgent
    });
  } as any;

  Object.setPrototypeOf(ProxiedWebSocket, OriginalWebSocket);
  ProxiedWebSocket.prototype = OriginalWebSocket.prototype;
  wsModule.WebSocket = ProxiedWebSocket;
  wsModule[DISCORD_WS_PROXY_PATCH] = { url: proxy.url };
}

function defaultDiscordRouteModel(config: EcliaConfig): string {
  const provider = config.inference.provider;

  if (provider === "anthropic") {
    const profiles = config.inference.anthropic?.profiles ?? [];
    const profile =
      profiles.find((p) => typeof p.api_key === "string" && p.api_key.trim()) ??
      profiles[0];
    return anthropicProfileRouteKey(String(profile?.id ?? "default"));
  }

  if (provider === "codex_oauth") {
    const profiles = config.inference.codex_oauth?.profiles ?? [];
    const profile = profiles[0];
    return codexOAuthProfileRouteKey(String(profile?.id ?? "default"));
  }

  const profiles = config.inference.openai_compat?.profiles ?? [];
  const profile =
    profiles.find((p) => typeof p.api_key === "string" && p.api_key.trim()) ??
    profiles[0];
  return openaiCompatProfileRouteKey(String(profile?.id ?? "default"));
}

type SlashRegistrationOutcome =
  | { mode: "global" }
  | { mode: "guild"; guildIds: string[] }
  | { mode: "none" };

async function registerSlashCommands(
  discord: DiscordModule,
  args: { token: string; appId: string; guildIds: string[]; forceGlobalCommands: boolean; restAgent: Dispatcher | null }
): Promise<SlashRegistrationOutcome> {
  const rest = new discord.REST({
    version: "10",
    ...(args.restAgent ? { agent: args.restAgent } : {})
  }).setToken(args.token);

  const commands = [
    {
      name: "eclia",
      description: "Chat with ECLIA",
      options: [
        {
          name: "prompt",
          description: "What should ECLIA do?",
          type: 3,
          required: true
        },
        {
          name: "verbose",
          description: "Show intermediate tool output (no message edits)",
          type: 5,
          required: false
        }
      ]
    },
    {
      name: "clear",
      description: "Clear this channel's ECLIA session"
    }
  ];

  const guildIds = normalizeIdList(args.guildIds);

  if (args.forceGlobalCommands) {
    await rest.put(discord.Routes.applicationCommands(args.appId), { body: commands });
    return { mode: "global" };
  }

  if (!guildIds.length) {
    // Explicitly clear global commands so force-global=off is deterministic.
    await rest.put(discord.Routes.applicationCommands(args.appId), { body: [] });
    return { mode: "none" };
  }

  for (const gid of guildIds) {
    await rest.put(discord.Routes.applicationGuildCommands(args.appId, gid), { body: commands });
  }
  await rest.put(discord.Routes.applicationCommands(args.appId), { body: [] });
  return { mode: "guild", guildIds };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { config } = loadEcliaConfig(process.cwd());
  const discordCfg = config.adapters.discord;

  const enabled = hasEnv("ECLIA_DISCORD_ENABLED") ? boolEnv("ECLIA_DISCORD_ENABLED") : Boolean(discordCfg.enabled);
  if (!enabled) {
    log.info("disabled (set adapters.discord.enabled=true in eclia.config.local.toml)");
    process.exit(0);
  }

  const token = env("DISCORD_BOT_TOKEN") || String(discordCfg.bot_token ?? "").trim();
  const appId = env("DISCORD_APP_ID") || String(discordCfg.app_id ?? "").trim();
  const envGuildIds = guildIdsFromEnv();
  const cfgGuildIds = normalizeIdList((discordCfg as any).guild_ids);
  const guildWhitelist = envGuildIds.length ? envGuildIds : cfgGuildIds;
  const guildWhitelistSet = new Set(guildWhitelist);
  const envUserIds = userIdsFromEnv();
  const cfgUserIds = normalizeIdList((discordCfg as any).user_whitelist);
  const userWhitelist = envUserIds.length ? envUserIds : cfgUserIds;
  const userWhitelistSet = new Set(userWhitelist);
  const forceGlobalCommands = forceGlobalCommandsFromEnv(Boolean((discordCfg as any).force_global_commands ?? false));

  if (!token) {
    log.error("Missing Discord bot token. Set it in Settings -> Adapters -> Discord (local TOML), or DISCORD_BOT_TOKEN.");
    process.exit(1);
  }
  if (!appId) {
    log.error(
      "Missing Discord Application ID (DISCORD_APP_ID / adapters.discord.app_id). " +
        "It is required to register slash commands. Set it in Settings -> Adapters -> Discord, or DISCORD_APP_ID env."
    );
    process.exit(1);
  }

  const gatewayUrl = guessGatewayUrl();
  if (!getGatewayToken()) {
    log.warn(
      "gateway token not found. Start the gateway once (it creates .eclia/gateway.token), " +
        "or set ECLIA_GATEWAY_TOKEN. Gateway requests will fail with 401 until a token is configured."
    );
  }
  const streamEdits = boolEnv("ECLIA_DISCORD_STREAM");
  const streamMode: "full" | "final" = streamEdits ? "full" : "final";

  const slashDefaultStreamMode: "full" | "final" =
    coerceStreamMode(env("ECLIA_DISCORD_DEFAULT_STREAM_MODE")) ?? coerceStreamMode(discordCfg.default_stream_mode) ?? "final";
  const slashDefaultVerbose = slashDefaultStreamMode === "full";
  const requirePrefix = requirePrefixFromEnv();
  const prefix = env("ECLIA_DISCORD_PREFIX", "!eclia");
  const toolAccessMode = parseToolAccessMode(env("ECLIA_DISCORD_TOOL_ACCESS_MODE", "full"));
  const proxy = resolveDiscordProxy(discordCfg);

  if (proxy) {
    installDiscordWsProxyShim(proxy);
  }

  const discord = (await import("discord.js")) as DiscordModule;
  const restAgent = proxy ? new ProxyAgent(proxy.url) : null;
  const routeModel = defaultDiscordRouteModel(config);

  log.info(`gateway: ${gatewayUrl}`);
  if (proxy) {
    log.info(`proxy: ${proxy.displayUrl} (${proxy.source})`);
  } else {
    log.info("proxy: disabled");
  }
  log.info(`model: ${routeModel}`);
  if (!userWhitelist.length) {
    log.warn("user whitelist is empty; slash/plain-message inputs will be ignored.");
  }

  log.info("Registering slash commands...");
  const registration = await registerSlashCommands(discord, { token, appId, guildIds: guildWhitelist, forceGlobalCommands, restAgent });
  if (registration.mode === "global") {
    log.info("Slash commands registered (global)");
  } else if (registration.mode === "guild") {
    log.info(`Slash commands registered for guild whitelist: ${registration.guildIds.join(", ")} (global cleared)`);
  } else {
    log.warn("Force-global is OFF but guild whitelist is empty. Slash commands are not registered anywhere.");
  }

  const intents = [
    discord.GatewayIntentBits.Guilds,
    discord.GatewayIntentBits.GuildMessages,
    discord.GatewayIntentBits.DirectMessages,
    discord.GatewayIntentBits.MessageContent
  ];

  const client = new discord.Client({
    intents,
    partials: [discord.Partials.Channel],
    ...(restAgent ? { rest: { agent: restAgent } } : {})
  });

  client.once(discord.Events.ClientReady, (c) => {
    log.info(`Logged in as ${c.user.tag}`);
  });

  // ----- Interaction handler (slash commands) -----

  client.on(discord.Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const userId = String(interaction.user?.id ?? "").trim();
    if (!userId || !userWhitelistSet.has(userId)) {
      try {
        await interaction.reply({
          content: "You are not in the Discord user whitelist.",
          flags: discord.MessageFlags.Ephemeral
        });
      } catch {
        // ignore permission/race errors
      }
      return;
    }

    if (forceGlobalCommands) {
      const guildId = String(interaction.guildId ?? "").trim();
      const isDm = !guildId;
      if (!isDm && !guildWhitelistSet.has(guildId)) {
        try {
          await interaction.reply({
            content: "This guild is not in the Discord guild whitelist.",
            flags: discord.MessageFlags.Ephemeral
          });
        } catch {
          // ignore permission/race errors
        }
        return;
      }
    }

    // /clear
    if (interaction.commandName === "clear") {
      const origin = originFromInteraction(interaction);
      const sessionId = sessionIdForDiscord(origin);
      try {
        await interaction.deferReply({ flags: discord.MessageFlags.Ephemeral });
        await resetGatewaySession(gatewayUrl, sessionId);
        await interaction.editReply("Cleared session for this channel.");
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        try { await interaction.editReply(`Error: ${msg}`); } catch { /* ignore */ }
      }
      return;
    }

    if (interaction.commandName !== "eclia") return;

    const prompt = interaction.options.getString("prompt", true);
    const verboseOpt = interaction.options.getBoolean("verbose");
    const verbose = verboseOpt ?? slashDefaultVerbose;

    const origin = originFromInteraction(interaction);
    const sessionId = sessionIdForDiscord(origin);

    const useRecordStream = streamEdits || verbose;
    const useStreamMode: "full" | "final" = verbose ? "full" : streamMode;

    try {
      await interaction.deferReply();
      if (useRecordStream) {
        const send = createInteractionSendFn(interaction);
        await sendTextOrFile(send, `**User**\n${prompt}`);
        await runGatewayChat({
          gatewayUrl,
          sessionId,
          origin,
          model: routeModel,
          streamMode: useStreamMode,
          userText: prompt,
          toolAccessMode,
          onRecord: makeOnRecordHandler(send)
        });
        return;
      }

      const out = await runGatewayChat({
        gatewayUrl,
        sessionId,
        origin,
        model: routeModel,
        streamMode: useStreamMode,
        userText: prompt,
        toolAccessMode
      });

      const text = formatDiscordOutboundText(out.text || "(empty)");
      if (text.length <= 1900) {
        await interaction.editReply(text);
      } else {
        const buf = Buffer.from(text, "utf8");
        await interaction.editReply({
          content: "Response too long; attached as a file.",
          files: [{ attachment: buf, name: `eclia-${crypto.randomUUID()}.txt` }]
        });
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      try {
        if (useRecordStream && (interaction as any).replied) {
          await interaction.followUp(`Error: ${msg}`);
        } else {
          await interaction.editReply(`Error: ${msg}`);
        }
      } catch { /* ignore */ }
    }
  });

  // ----- Message handler (plain text by default; optional required prefix) -----

  client.on(discord.Events.MessageCreate, async (message) => {
    if (!message.content) return;
    if (message.author?.bot) return;
    const userId = String(message.author?.id ?? "").trim();
    if (!userId || !userWhitelistSet.has(userId)) return;
    if (forceGlobalCommands) {
      const guildId = String(message.guildId ?? "").trim();
      const isDm = !guildId;
      if (!isDm && !guildWhitelistSet.has(guildId)) return;
    }
    const content = message.content.trim();
    if (!content) return;

    let prompt = content;
    if (requirePrefix) {
      if (!content.startsWith(prefix)) return;
      prompt = content.slice(prefix.length).trim();
    } else if (content.startsWith(prefix)) {
      prompt = content.slice(prefix.length).trim();
    }
    if (!prompt) return;

    const origin = originFromMessage(message);
    const sessionId = sessionIdForDiscord(origin);

    try {
      if (streamEdits) {
        const send = createMessageSendFn(message);
        await runGatewayChat({
          gatewayUrl,
          sessionId,
          origin,
          model: routeModel,
          streamMode,
          userText: prompt,
          toolAccessMode,
          onRecord: makeOnRecordHandler(send)
        });
        return;
      }

      const reply = await message.reply("thinking...");

      const out = await runGatewayChat({
        gatewayUrl,
        sessionId,
        origin,
        model: routeModel,
        streamMode,
        userText: prompt,
        toolAccessMode
      });

      const text = formatDiscordOutboundText(out.text || "The model said nothing.");
      if (text.length <= 1900) {
        await reply.edit(text);
      } else {
        const buf = Buffer.from(text, "utf8");
        await reply.edit({ content: "Response too long; attached as a file." });
        await message.channel.send({ files: [{ attachment: buf, name: `eclia-${crypto.randomUUID()}.txt` }] });
      }
    } catch (e: any) {
      await message.reply(`Error: ${String(e?.message ?? e)}`);
    }
  });

  // ----- Outbound HTTP endpoint (gateway -> adapter -> discord) -----

  const port = Number(env("ECLIA_DISCORD_ADAPTER_PORT", "8790")) || 8790;
  const key = env("ECLIA_ADAPTER_KEY");
  const server = http.createServer(async (req, res) => {
   try {
    const u = new URL(req.url ?? "/", "http://localhost");
    if (u.pathname === "/health") return json(res, 200, { ok: true });

    if (u.pathname === "/send" && req.method === "POST") {
      if (key) {
        const got = String(req.headers["x-eclia-adapter-key"] ?? "");
        if (got !== key) return json(res, 403, { ok: false, error: "forbidden" });
      }

      const body = (await readJson(req)) as SendRequest;
      const origin = body?.origin;
      if (!origin || origin.kind !== "discord" || typeof origin.channelId !== "string") {
        return json(res, 400, { ok: false, error: "bad_origin" });
      }

      const targetId = origin.threadId ?? origin.channelId;
      const channel = await client.channels.fetch(targetId).catch(() => null);
      if (!channel || !(channel as any).isTextBased?.()) {
        return json(res, 404, { ok: false, error: "channel_not_found" });
      }

      const refs = Array.isArray(body.refs) ? body.refs : [];
      const files: Array<{ attachment: Buffer; name: string }> = [];
      for (const r of refs) {
        const parsed = extractRefToRepoRelPath(r);
        if (!parsed) continue;
        const buf = await fetchArtifactBytes(gatewayUrl, parsed.relPath);
        files.push({ attachment: buf, name: parsed.name });
        if (files.length >= 10) break;
      }

      const contentStr = formatDiscordOutboundText(typeof body.content === "string" ? body.content : "");

      await (channel as any).send({
        content: contentStr || (files.length ? "" : "(empty)"),
        files: files.length ? files : undefined
      });

      return json(res, 200, { ok: true });
    }

    return json(res, 404, { ok: false, error: "not_found" });
   } catch (e) {
    log.error("unhandled route error:", e);
    if (!res.headersSent) {
      json(res, 500, { ok: false, error: "internal_error" });
    } else if (!res.writableEnded) {
      try { res.end(); } catch { /* ignore */ }
    }
   }
  });

  server.on("error", (err) => {
    log.error("server error:", err);
  });

  client.on("error", (err) => {
    log.error("client error:", err);
  });

  server.listen(port, "127.0.0.1", () => {
    log.info(`outbound endpoint: http://127.0.0.1:${port}`);
  });

  // Graceful shutdown: close HTTP server, destroy Discord client.
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("shutting down...");
    server.close();
    client.destroy();
    // Give pending I/O a moment to flush, then exit.
    setTimeout(() => process.exit(0), 500);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await client.login(token);
}

installProcessErrorHandlers("discord");

main().catch((e) => {
  log.error("fatal", e);
  process.exit(1);
});
