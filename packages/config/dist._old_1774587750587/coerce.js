import { DEFAULT_ECLIA_CONFIG } from "./types.js";
import { ANTHROPIC_DEFAULT_AUTH_HEADER, ANTHROPIC_DEFAULT_VERSION, DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME, OPENAI_COMPAT_DEFAULT_AUTH_HEADER, isInferenceProviderId } from "./provider-defaults.js";
function coerceDiscordStreamMode(v, fallback) {
    if (typeof v !== "string")
        return fallback;
    const s = v.trim();
    if (s === "full" || s === "final")
        return s;
    return fallback;
}
export function isRecord(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
function clampPort(v, fallback) {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (!Number.isFinite(n))
        return fallback;
    const i = Math.trunc(n);
    if (i < 1 || i > 65535)
        return fallback;
    return i;
}
function clampInt(v, min, max, fallback) {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (!Number.isFinite(n))
        return fallback;
    const i = Math.trunc(n);
    if (i < min || i > max)
        return fallback;
    return i;
}
function clampFloat(v, min, max, fallback) {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (!Number.isFinite(n))
        return fallback;
    if (n < min || n > max)
        return fallback;
    return n;
}
function coerceHost(v, fallback) {
    if (typeof v !== "string")
        return fallback;
    const s = v.trim();
    return s.length ? s : fallback;
}
function coerceString(v, fallback) {
    if (typeof v !== "string")
        return fallback;
    const s = v.trim();
    return s.length ? s : fallback;
}
export function coerceOptionalString(v) {
    if (typeof v !== "string")
        return undefined;
    const s = v.trim();
    return s.length ? s : undefined;
}
function coerceOptionalNumber(v) {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (!Number.isFinite(n))
        return undefined;
    return Math.trunc(n);
}
export function coerceProfileId(v, fallback) {
    if (typeof v === "string") {
        const s = v.trim();
        if (s)
            return s;
    }
    if (typeof v === "number" && Number.isFinite(v))
        return String(Math.trunc(v));
    return fallback;
}
export function coerceStringArray(v, fallback = []) {
    if (Array.isArray(v)) {
        const out = [];
        for (const x of v) {
            const s = typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : "";
            if (!s)
                continue;
            out.push(s);
        }
        return out;
    }
    if (typeof v === "string") {
        const out = v
            .split(/[\n\r,\t\s]+/g)
            .map((s) => s.trim())
            .filter(Boolean);
        return out.length ? out : fallback;
    }
    return fallback;
}
function coerceBool(v, fallback) {
    if (typeof v === "boolean")
        return v;
    if (typeof v === "number")
        return v !== 0;
    if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        if (s === "1" || s === "true" || s === "yes" || s === "on")
            return true;
        if (s === "0" || s === "false" || s === "no" || s === "off")
            return false;
    }
    return fallback;
}
export function deepMerge(a, b) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) {
        if (isRecord(v) && isRecord(out[k]))
            out[k] = deepMerge(out[k], v);
        else
            out[k] = v;
    }
    return out;
}
export function coerceConfig(raw) {
    const base = DEFAULT_ECLIA_CONFIG;
    const codex_home = coerceOptionalString(raw.codex_home);
    const consoleRaw = isRecord(raw.console) ? raw.console : {};
    const apiRaw = isRecord(raw.api) ? raw.api : {};
    const memoryRaw = isRecord(raw.memory) ? raw.memory : {};
    const debugRaw = isRecord(raw.debug) ? raw.debug : {};
    const skillsRaw = isRecord(raw.skills) ? raw.skills : {};
    const toolsRaw = isRecord(raw.tools) ? raw.tools : {};
    const personaRaw = isRecord(raw.persona) ? raw.persona : {};
    const infRaw = isRecord(raw.inference) ? raw.inference : {};
    const openaiRaw = isRecord(infRaw.openai_compat) ? infRaw.openai_compat : {};
    const anthropicRaw = isRecord(infRaw.anthropic) ? infRaw.anthropic : {};
    const codexRaw = isRecord(infRaw.codex_oauth) ? infRaw.codex_oauth : {};
    const symphonyRaw = isRecord(raw.symphony) ? raw.symphony : {};
    const adaptersRaw = isRecord(raw.adapters) ? raw.adapters : {};
    const discordRaw = isRecord(adaptersRaw.discord) ? adaptersRaw.discord : {};
    const telegramRaw = isRecord(adaptersRaw.telegram) ? adaptersRaw.telegram : {};
    const providerRaw = typeof infRaw.provider === "string" ? String(infRaw.provider).trim() : "";
    const provider = isInferenceProviderId(providerRaw) ? providerRaw : base.inference.provider;
    const system_instruction = coerceOptionalString(infRaw.system_instruction);
    const user_preferred_name = coerceOptionalString(personaRaw.user_preferred_name);
    const assistant_name = coerceOptionalString(personaRaw.assistant_name);
    // Profiles (new schema). If missing/empty, fall back to legacy keys on [inference.openai_compat].
    const rawProfiles = Array.isArray(openaiRaw.profiles) ? openaiRaw.profiles : null;
    const profiles = [];
    const seen = new Set();
    if (rawProfiles && rawProfiles.length) {
        for (let i = 0; i < rawProfiles.length; i++) {
            const p = rawProfiles[i];
            if (!isRecord(p))
                continue;
            const id = coerceProfileId(p.id, `profile_${i + 1}`);
            if (seen.has(id))
                continue;
            seen.add(id);
            const rawWF = coerceOptionalString(p.wire_format);
            profiles.push({
                ...p,
                id,
                name: coerceString(p.name, `Profile ${i + 1}`),
                base_url: coerceString(p.base_url, base.inference.openai_compat.profiles[0].base_url),
                model: coerceString(p.model, base.inference.openai_compat.profiles[0].model),
                api_key: coerceOptionalString(p.api_key),
                auth_header: coerceString(p.auth_header, base.inference.openai_compat.profiles[0].auth_header ?? OPENAI_COMPAT_DEFAULT_AUTH_HEADER),
                wire_format: rawWF === "responses" ? "responses" : "completion"
            });
        }
    }
    // Legacy schema fallback: base_url/model/api_key/auth_header at [inference.openai_compat]
    if (profiles.length === 0) {
        profiles.push({
            id: DEFAULT_PROFILE_ID,
            name: DEFAULT_PROFILE_NAME,
            base_url: coerceString(openaiRaw.base_url, base.inference.openai_compat.profiles[0].base_url),
            model: coerceString(openaiRaw.model, base.inference.openai_compat.profiles[0].model),
            api_key: coerceOptionalString(openaiRaw.api_key),
            auth_header: coerceString(openaiRaw.auth_header, base.inference.openai_compat.profiles[0].auth_header ?? OPENAI_COMPAT_DEFAULT_AUTH_HEADER),
            wire_format: "completion"
        });
    }
    // Anthropic (Messages API)
    const anthropicProfilesRaw = Array.isArray(anthropicRaw.profiles) ? anthropicRaw.profiles : null;
    const anthropicProfiles = [];
    const seenAnthropic = new Set();
    if (anthropicProfilesRaw && anthropicProfilesRaw.length) {
        for (let i = 0; i < anthropicProfilesRaw.length; i++) {
            const p = anthropicProfilesRaw[i];
            if (!isRecord(p))
                continue;
            const id = coerceProfileId(p.id, `profile_${i + 1}`);
            if (seenAnthropic.has(id))
                continue;
            seenAnthropic.add(id);
            anthropicProfiles.push({
                ...p,
                id,
                name: coerceString(p.name, `Profile ${i + 1}`),
                base_url: coerceString(p.base_url, base.inference.anthropic.profiles[0].base_url),
                model: coerceString(p.model, base.inference.anthropic.profiles[0].model),
                api_key: coerceOptionalString(p.api_key),
                auth_header: coerceString(p.auth_header, base.inference.anthropic.profiles[0].auth_header ?? ANTHROPIC_DEFAULT_AUTH_HEADER),
                anthropic_version: coerceString(p.anthropic_version, base.inference.anthropic.profiles[0].anthropic_version ?? ANTHROPIC_DEFAULT_VERSION)
            });
        }
    }
    // Legacy schema fallback: base_url/model/api_key/auth_header/anthropic_version at [inference.anthropic]
    if (anthropicProfiles.length === 0) {
        anthropicProfiles.push({
            id: DEFAULT_PROFILE_ID,
            name: DEFAULT_PROFILE_NAME,
            base_url: coerceString(anthropicRaw.base_url, base.inference.anthropic.profiles[0].base_url),
            model: coerceString(anthropicRaw.model, base.inference.anthropic.profiles[0].model),
            api_key: coerceOptionalString(anthropicRaw.api_key),
            auth_header: coerceString(anthropicRaw.auth_header, base.inference.anthropic.profiles[0].auth_header ?? ANTHROPIC_DEFAULT_AUTH_HEADER),
            anthropic_version: coerceString(anthropicRaw.anthropic_version, base.inference.anthropic.profiles[0].anthropic_version ?? ANTHROPIC_DEFAULT_VERSION)
        });
    }
    // Codex OAuth (optional; used for ChatGPT/Codex browser login tokens).
    const codexProfilesRaw = Array.isArray(codexRaw.profiles) ? codexRaw.profiles : null;
    const codexProfiles = [];
    const seenCodex = new Set();
    if (codexProfilesRaw && codexProfilesRaw.length) {
        // ECLIA supports a single Codex OAuth profile (Codex auth is global).
        // If multiple profiles are present in TOML, we keep the first valid one.
        for (let i = 0; i < codexProfilesRaw.length; i++) {
            const p = codexProfilesRaw[i];
            if (!isRecord(p))
                continue;
            const id = coerceProfileId(p.id, DEFAULT_PROFILE_ID);
            if (seenCodex.has(id))
                continue;
            seenCodex.add(id);
            const name = coerceString(p.name, DEFAULT_PROFILE_NAME);
            const model = coerceString(p.model, base.inference.codex_oauth.profiles[0]?.model ?? base.inference.openai_compat.profiles[0].model);
            const access_token = coerceOptionalString(p.access_token);
            const refresh_token = coerceOptionalString(p.refresh_token);
            const id_token = coerceOptionalString(p.id_token);
            const expires_at = coerceOptionalNumber(p.expires_at);
            codexProfiles.push({ id: DEFAULT_PROFILE_ID, name, model, access_token, refresh_token, id_token, expires_at });
            break;
        }
    }
    // If config omits Codex profiles, fall back to DEFAULT_ECLIA_CONFIG.
    const codexProfilesOut = (codexProfiles.length ? codexProfiles : base.inference.codex_oauth.profiles).slice(0, 1);
    return {
        ...(codex_home ? { codex_home } : {}),
        console: {
            host: coerceHost(consoleRaw.host, base.console.host),
            port: clampPort(consoleRaw.port, base.console.port)
        },
        api: {
            port: clampPort(apiRaw.port, base.api.port)
        },
        memory: {
            enabled: coerceBool(memoryRaw.enabled, base.memory.enabled),
            host: coerceHost(memoryRaw.host, base.memory.host),
            port: clampPort(memoryRaw.port, base.memory.port),
            timeout_ms: clampInt(memoryRaw.timeout_ms, 50, 60_000, base.memory.timeout_ms)
        },
        debug: {
            capture_upstream_requests: coerceBool(debugRaw.capture_upstream_requests, base.debug.capture_upstream_requests),
            parse_assistant_output: coerceBool(debugRaw.parse_assistant_output, base.debug.parse_assistant_output ?? false)
        },
        skills: {
            enabled: coerceStringArray(skillsRaw.enabled, base.skills.enabled ?? [])
        },
        tools: {
            enabled: coerceStringArray(toolsRaw.enabled, base.tools.enabled)
        },
        persona: {
            ...(user_preferred_name ? { user_preferred_name } : {}),
            ...(assistant_name ? { assistant_name } : {})
        },
        inference: {
            ...(system_instruction ? { system_instruction } : {}),
            provider,
            openai_compat: {
                profiles
            },
            anthropic: {
                profiles: anthropicProfiles.length ? anthropicProfiles : base.inference.anthropic.profiles
            },
            codex_oauth: {
                profiles: codexProfilesOut
            }
        },
        adapters: {
            discord: {
                enabled: coerceBool(discordRaw.enabled, base.adapters.discord.enabled),
                app_id: typeof discordRaw.app_id === "string" && discordRaw.app_id.trim().length
                    ? discordRaw.app_id.trim()
                    : undefined,
                bot_token: typeof discordRaw.bot_token === "string" ? discordRaw.bot_token : undefined,
                guild_ids: coerceStringArray(discordRaw.guild_ids, base.adapters.discord.guild_ids ?? []),
                user_whitelist: coerceStringArray(discordRaw.user_whitelist, base.adapters.discord.user_whitelist ?? []),
                force_global_commands: coerceBool(discordRaw.force_global_commands, Boolean(base.adapters.discord.force_global_commands ?? false)),
                default_stream_mode: coerceDiscordStreamMode(discordRaw.default_stream_mode, (base.adapters.discord.default_stream_mode ?? "final"))
            },
            telegram: {
                enabled: coerceBool(telegramRaw.enabled, base.adapters.telegram.enabled),
                bot_token: typeof telegramRaw.bot_token === "string" ? telegramRaw.bot_token : undefined,
                user_whitelist: coerceStringArray(telegramRaw.user_whitelist, base.adapters.telegram.user_whitelist ?? []),
                group_whitelist: coerceStringArray(telegramRaw.group_whitelist, base.adapters.telegram.group_whitelist ?? [])
            }
        },
        symphony: {
            enabled: coerceBool(symphonyRaw.enabled, base.symphony.enabled),
            host: coerceHost(symphonyRaw.host, base.symphony.host),
            port: clampPort(symphonyRaw.port, base.symphony.port)
        }
    };
}
