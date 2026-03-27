/// <reference path="./iarna__toml.d.ts" />
import fs from "node:fs";
import path from "node:path";
import * as TOML from "@iarna/toml";
import { coerceConfig, coerceOptionalString, coerceProfileId, deepMerge, isRecord } from "./coerce.js";
import { findProjectRoot } from "./root.js";
import { ensureSystemInstructionFiles, readSystemInstruction, writeSystemInstructionLocal } from "./system-instruction.js";
import { ensureSystemMemoryTemplateFiles } from "./system-memory.js";
import { ensureSystemSkillsTemplateFiles } from "./system-skills.js";
import { DEFAULT_PROFILE_ID } from "./provider-defaults.js";
function tryReadToml(filePath) {
    try {
        if (!fs.existsSync(filePath))
            return {};
        const txt = fs.readFileSync(filePath, "utf-8");
        const parsed = TOML.parse(txt);
        return isRecord(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
}
/**
 * Ensure eclia.config.local.toml exists.
 * This is intentionally best-effort: failures should not crash dev startup.
 */
export function ensureLocalConfig(rootDir = findProjectRoot(process.cwd())) {
    const localPath = path.join(rootDir, "eclia.config.local.toml");
    if (fs.existsSync(localPath))
        return { rootDir, localPath, created: false };
    try {
        // "wx" = write only if not exists (prevents clobbering)
        fs.writeFileSync(localPath, "# ECLIA local overrides (gitignored)\n", { encoding: "utf-8", flag: "wx" });
        return { rootDir, localPath, created: true };
    }
    catch {
        return { rootDir, localPath, created: false };
    }
}
export function loadEcliaConfig(startDir = process.cwd()) {
    const rootDir = findProjectRoot(startDir);
    const configPath = path.join(rootDir, "eclia.config.toml");
    const localPath = path.join(rootDir, "eclia.config.local.toml");
    // best-effort create local overrides file
    ensureLocalConfig(rootDir);
    ensureSystemInstructionFiles(rootDir);
    ensureSystemMemoryTemplateFiles(rootDir);
    ensureSystemSkillsTemplateFiles(rootDir);
    const base = tryReadToml(configPath);
    const local = tryReadToml(localPath);
    const merged = deepMerge(base, local);
    const config = coerceConfig(merged);
    const systemInstruction = readSystemInstruction(rootDir);
    config.inference.system_instruction = systemInstruction.text;
    return { rootDir, configPath, localPath, config, raw: merged };
}
/**
 * Write a patch into eclia.config.local.toml.
 *
 * Safety rule:
 * - preserve unknown keys/sections (do not wipe inference keys just to update host/port).
 * - normalize known keys for type safety.
 */
export function writeLocalEcliaConfig(patch, startDir = process.cwd()) {
    const rootDir = findProjectRoot(startDir);
    const localPath = path.join(rootDir, "eclia.config.local.toml");
    ensureLocalConfig(rootDir);
    ensureSystemInstructionFiles(rootDir);
    ensureSystemMemoryTemplateFiles(rootDir);
    ensureSystemSkillsTemplateFiles(rootDir);
    let patchSystemInstruction;
    if (patch.inference && Object.prototype.hasOwnProperty.call(patch.inference, "system_instruction")) {
        const raw = patch.inference.system_instruction;
        if (typeof raw === "string")
            patchSystemInstruction = raw;
        const nextInferencePatch = { ...patch.inference };
        delete nextInferencePatch.system_instruction;
        patch = {
            ...patch,
            inference: nextInferencePatch
        };
    }
    const currentLocal = tryReadToml(localPath);
    // Special-case: profiles are an array, so deepMerge() replaces wholesale.
    // Preserve existing secrets (api_key) per profile id unless the patch explicitly sets a new one.
    const currentProfilesRaw = currentLocal?.inference?.openai_compat?.profiles;
    const currentProfiles = Array.isArray(currentProfilesRaw) ? currentProfilesRaw : null;
    const legacyKey = coerceOptionalString(currentLocal?.inference?.openai_compat?.api_key);
    const legacyAuthHeader = coerceOptionalString(currentLocal?.inference?.openai_compat?.auth_header);
    if (patch.inference?.openai_compat && Array.isArray(patch.inference.openai_compat.profiles)) {
        const patched = patch.inference.openai_compat.profiles;
        const preserved = [];
        for (let i = 0; i < patched.length; i++) {
            const p = patched[i];
            if (!isRecord(p))
                continue;
            const id = coerceProfileId(p.id, `profile_${i + 1}`);
            const existing = currentProfiles?.find((x) => isRecord(x) && coerceProfileId(x.id, "") === id);
            // Spread existing profile first so that TOML-only fields survive the round-trip.
            // Then overlay the patch; patch keys win.
            const next = {
                ...(isRecord(existing) ? existing : {}),
                ...p,
                id
            };
            // Preserve api_key when the patch omits it (UI sends api_key only when the user typed a new one).
            if (!Object.prototype.hasOwnProperty.call(p, "api_key")) {
                // existing api_key is already in next via spread, but handle legacy fallback.
                if (!next.api_key && id === DEFAULT_PROFILE_ID && legacyKey)
                    next.api_key = legacyKey;
            }
            // Preserve auth_header via legacy fallback (existing already spread in).
            if (!Object.prototype.hasOwnProperty.call(p, "auth_header")) {
                if (!next.auth_header && id === DEFAULT_PROFILE_ID && legacyAuthHeader)
                    next.auth_header = legacyAuthHeader;
            }
            preserved.push(next);
        }
        patch.inference.openai_compat.profiles = preserved;
    }
    // Special-case: Anthropic profiles are also an array, so deepMerge() replaces wholesale.
    // Preserve existing secrets (api_key) per profile id unless the patch explicitly sets a new one.
    {
        const currentAnthropicProfilesRaw = currentLocal?.inference?.anthropic?.profiles;
        const currentAnthropicProfiles = Array.isArray(currentAnthropicProfilesRaw) ? currentAnthropicProfilesRaw : null;
        const legacyKey = coerceOptionalString(currentLocal?.inference?.anthropic?.api_key);
        const legacyAuthHeader = coerceOptionalString(currentLocal?.inference?.anthropic?.auth_header);
        const legacyVersion = coerceOptionalString(currentLocal?.inference?.anthropic?.anthropic_version);
        if (patch.inference?.anthropic && Array.isArray(patch.inference.anthropic.profiles)) {
            const patched = patch.inference.anthropic.profiles;
            const preserved = [];
            for (let i = 0; i < patched.length; i++) {
                const p = patched[i];
                if (!isRecord(p))
                    continue;
                const id = coerceProfileId(p.id, `profile_${i + 1}`);
                const existing = currentAnthropicProfiles?.find((x) => isRecord(x) && coerceProfileId(x.id, "") === id);
                // Spread existing profile first so that TOML-only fields survive the round-trip.
                const next = {
                    ...(isRecord(existing) ? existing : {}),
                    ...p,
                    id
                };
                // Legacy fallbacks (existing fields already spread in).
                if (!Object.prototype.hasOwnProperty.call(p, "api_key")) {
                    if (!next.api_key && id === DEFAULT_PROFILE_ID && legacyKey)
                        next.api_key = legacyKey;
                }
                if (!Object.prototype.hasOwnProperty.call(p, "auth_header")) {
                    if (!next.auth_header && id === DEFAULT_PROFILE_ID && legacyAuthHeader)
                        next.auth_header = legacyAuthHeader;
                }
                if (!Object.prototype.hasOwnProperty.call(p, "anthropic_version")) {
                    if (!next.anthropic_version && id === DEFAULT_PROFILE_ID && legacyVersion)
                        next.anthropic_version = legacyVersion;
                }
                preserved.push(next);
            }
            patch.inference.anthropic.profiles = preserved;
        }
    }
    // Special-case: tools.web.profiles is also an array, so deepMerge() replaces wholesale.
    // Preserve existing secrets (api_key) per profile id unless the patch explicitly sets a new one.
    {
        const patchToolsWeb = patch?.tools?.web;
        const patchedProfilesRaw = patchToolsWeb?.profiles;
        const currentWebProfilesRaw = currentLocal?.tools?.web?.profiles;
        const currentWebProfiles = Array.isArray(currentWebProfilesRaw) ? currentWebProfilesRaw : null;
        const legacyTavilyKey = coerceOptionalString(currentLocal?.tools?.web?.tavily?.api_key) ||
            coerceOptionalString(currentLocal?.tools?.tavily?.api_key) ||
            coerceOptionalString(currentLocal?.tavily_api_key);
        const activeId = coerceOptionalString(patchToolsWeb?.active_profile) ||
            coerceOptionalString(currentLocal?.tools?.web?.active_profile) ||
            DEFAULT_PROFILE_ID;
        if (patchToolsWeb && Array.isArray(patchedProfilesRaw)) {
            const patched = patchedProfilesRaw;
            const preserved = [];
            for (let i = 0; i < patched.length; i++) {
                const p = patched[i];
                if (!isRecord(p))
                    continue;
                const id = coerceProfileId(p.id, `profile_${i + 1}`);
                const existing = currentWebProfiles?.find((x) => isRecord(x) && coerceProfileId(x.id, "") === id);
                // Spread existing profile first so that TOML-only fields survive the round-trip.
                const next = {
                    ...(isRecord(existing) ? existing : {}),
                    ...p,
                    id
                };
                // Legacy fallback (existing api_key already spread in).
                if (!Object.prototype.hasOwnProperty.call(p, "api_key")) {
                    if (!next.api_key && id === activeId && legacyTavilyKey)
                        next.api_key = legacyTavilyKey;
                }
                preserved.push(next);
            }
            patchToolsWeb.profiles = preserved;
            patch.tools.web = patchToolsWeb;
        }
    }
    const nextLocal = deepMerge(currentLocal, patch);
    // Normalize known keys, but keep everything else.
    const normalized = coerceConfig(nextLocal);
    // Rebuild known sections on top of the merged object so types are stable.
    const toWrite = {
        ...nextLocal,
        console: { host: normalized.console.host, port: normalized.console.port },
        api: { port: normalized.api.port },
        debug: {
            ...(isRecord(nextLocal.debug) ? nextLocal.debug : {}),
            capture_upstream_requests: normalized.debug.capture_upstream_requests,
            parse_assistant_output: normalized.debug.parse_assistant_output ?? false
        },
        skills: {
            ...(isRecord(nextLocal.skills) ? nextLocal.skills : {}),
            enabled: normalized.skills.enabled
        },
        persona: {
            ...(isRecord(nextLocal.persona) ? nextLocal.persona : {}),
            ...(normalized.persona.user_preferred_name ? { user_preferred_name: normalized.persona.user_preferred_name } : {}),
            ...(normalized.persona.assistant_name ? { assistant_name: normalized.persona.assistant_name } : {})
        },
        inference: {
            ...(isRecord(nextLocal.inference) ? nextLocal.inference : {}),
            provider: normalized.inference.provider,
            openai_compat: {
                ...(isRecord(nextLocal.inference?.openai_compat) ? nextLocal.inference.openai_compat : {}),
                profiles: normalized.inference.openai_compat.profiles.map(({ api_key: _k, ...rest }) => rest)
            },
            anthropic: {
                ...(isRecord(nextLocal.inference?.anthropic) ? nextLocal.inference.anthropic : {}),
                profiles: normalized.inference.anthropic.profiles.map(({ api_key: _k, ...rest }) => rest)
            }
        },
        adapters: {
            ...(isRecord(nextLocal.adapters) ? nextLocal.adapters : {}),
            discord: {
                ...(isRecord(nextLocal?.adapters?.discord) ? nextLocal.adapters.discord : {}),
                enabled: normalized.adapters.discord.enabled
            }
        }
    };
    // skills.enabled: omit the whole [skills] table when it would be empty AND
    // it doesn't contain any other user-defined keys.
    {
        const rawSkills = isRecord(nextLocal.skills) ? nextLocal.skills : null;
        const hasOtherKeys = rawSkills ? Object.keys(rawSkills).some((k) => k !== "enabled") : false;
        if (!hasOtherKeys && normalized.skills.enabled.length === 0) {
            delete toWrite.skills;
        }
    }
    // persona.*: omit the whole [persona] table when it would be empty and it has no other keys.
    {
        const rawPersona = isRecord(nextLocal.persona) ? nextLocal.persona : null;
        const hasOtherKeys = rawPersona
            ? Object.keys(rawPersona).some((k) => k !== "user_preferred_name" && k !== "assistant_name")
            : false;
        const hasUserPreferredName = Boolean(normalized.persona.user_preferred_name);
        const hasAssistantName = Boolean(normalized.persona.assistant_name);
        if (!hasOtherKeys && !hasUserPreferredName && !hasAssistantName) {
            delete toWrite.persona;
        }
    }
    // debug.capture_upstream_requests: omit the whole [debug] table when it would be default (false)
    // AND it doesn't contain any other user-defined keys.
    {
        const rawDebug = isRecord(nextLocal.debug) ? nextLocal.debug : null;
        const hasOtherKeys = rawDebug ? Object.keys(rawDebug).some((k) => k !== "capture_upstream_requests" && k !== "parse_assistant_output") : false;
        const parseEnabled = Boolean(normalized.debug.parse_assistant_output ?? false);
        if (!hasOtherKeys && normalized.debug.capture_upstream_requests === false && parseEnabled === false) {
            delete toWrite.debug;
        }
    }
    // System instruction now lives in _system.local.md (with _system.md fallback), not TOML.
    delete toWrite.inference.system_instruction;
    // codex_home: write only if configured; otherwise omit from TOML.
    const codexHome = coerceOptionalString(nextLocal.codex_home);
    if (codexHome)
        toWrite.codex_home = codexHome;
    else
        delete toWrite.codex_home;
    // inference.openai_compat.profiles[].api_key: only write keys that exist in the file.
    const nextProfilesRaw = nextLocal?.inference?.openai_compat?.profiles;
    if (Array.isArray(nextProfilesRaw)) {
        const byId = new Map();
        for (const p of nextProfilesRaw) {
            if (!isRecord(p))
                continue;
            const id = coerceProfileId(p.id, "");
            if (!id)
                continue;
            byId.set(id, p);
        }
        const out = toWrite.inference.openai_compat.profiles;
        for (let i = 0; i < out.length; i++) {
            const row = out[i];
            const raw = byId.get(String(row.id));
            const key = coerceOptionalString(raw?.api_key);
            if (key)
                row.api_key = key;
        }
    }
    // inference.anthropic.profiles[].api_key: only write keys that exist in the file.
    const nextAnthropicProfilesRaw = nextLocal?.inference?.anthropic?.profiles;
    if (Array.isArray(nextAnthropicProfilesRaw)) {
        const byId = new Map();
        for (const p of nextAnthropicProfilesRaw) {
            if (!isRecord(p))
                continue;
            const id = coerceProfileId(p.id, "");
            if (!id)
                continue;
            byId.set(id, p);
        }
        const out = (toWrite.inference?.anthropic?.profiles ?? []);
        for (let i = 0; i < out.length; i++) {
            const row = out[i];
            const raw = byId.get(String(row.id));
            const key = coerceOptionalString(raw?.api_key);
            if (key)
                row.api_key = key;
        }
    }
    // adapters.discord.bot_token: only write if present in patch OR already present in file
    const hasDiscordToken = typeof nextLocal?.adapters?.discord?.bot_token === "string";
    if (hasDiscordToken) {
        toWrite.adapters.discord.bot_token = nextLocal.adapters.discord.bot_token;
    }
    // adapters.discord.app_id: only write if present in patch OR already present in file
    const hasDiscordAppId = typeof nextLocal?.adapters?.discord?.app_id === "string";
    if (hasDiscordAppId) {
        toWrite.adapters.discord.app_id = nextLocal.adapters.discord.app_id;
    }
    // adapters.discord.guild_ids: write if present in patch OR already present in file
    const hasDiscordGuildIds = Array.isArray(nextLocal?.adapters?.discord?.guild_ids);
    if (hasDiscordGuildIds) {
        toWrite.adapters.discord.guild_ids = normalized.adapters.discord.guild_ids ?? [];
    }
    // adapters.discord.user_whitelist: write if present in patch OR already present in file
    const hasDiscordUserWhitelist = Array.isArray(nextLocal?.adapters?.discord?.user_whitelist);
    if (hasDiscordUserWhitelist) {
        toWrite.adapters.discord.user_whitelist = normalized.adapters.discord.user_whitelist ?? [];
    }
    // adapters.discord.force_global_commands: write if present in patch OR already present in file
    const hasDiscordForceGlobalCommands = Object.prototype.hasOwnProperty.call((nextLocal?.adapters?.discord ?? {}), "force_global_commands");
    if (hasDiscordForceGlobalCommands) {
        toWrite.adapters.discord.force_global_commands = Boolean(normalized.adapters.discord.force_global_commands ?? false);
    }
    try {
        fs.writeFileSync(localPath, TOML.stringify(toWrite), "utf-8");
    }
    catch (e) {
        throw new Error(`Failed to write config: ${e?.message ?? e}`);
    }
    if (patchSystemInstruction !== undefined) {
        writeSystemInstructionLocal(rootDir, patchSystemInstruction);
    }
    const { config } = loadEcliaConfig(rootDir);
    return { rootDir, localPath, config };
}
/**
 * Low-level read-modify-write on eclia.config.local.toml.
 *
 * Unlike writeLocalEcliaConfig, this does NOT normalize or rebuild known sections.
 * It simply reads the local TOML, passes the parsed object to `mutate` for
 * in-place edits, and writes the result back.
 */
export function patchLocalToml(rootDir, mutate) {
    const localPath = path.join(rootDir, "eclia.config.local.toml");
    ensureLocalConfig(rootDir);
    const current = tryReadToml(localPath);
    mutate(current);
    try {
        fs.writeFileSync(localPath, TOML.stringify(current), "utf-8");
    }
    catch (e) {
        throw new Error(`Failed to write config: ${e?.message ?? e}`);
    }
}
