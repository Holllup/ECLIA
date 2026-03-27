import { type InferenceProviderId } from "./provider-defaults.js";
/**
 * Canonical config schema (dev-time).
 * - eclia.config.toml: committed defaults (no secrets)
 * - eclia.config.local.toml: machine-specific overrides (gitignored, may contain secrets)
 *
 * IMPORTANT:
 * - UI "preferences" should not be stored in TOML (use localStorage). TOML is for process startup config.
 */
export type EcliaConfig = {
    /**
     * Optional override for Codex CLI local state directory.
     * If set, gateway will treat this as ECLIA_CODEX_HOME / CODEX_HOME for spawned `codex app-server`.
     */
    codex_home?: string;
    console: {
        host: string;
        port: number;
    };
    api: {
        port: number;
    };
    /**
     * Memory service (optional).
     *
     * When enabled, the gateway will call the memory service for:
     * - /recall before prompt assembly
     */
    memory: {
        enabled: boolean;
        host: string;
        port: number;
        /**
         * Gateway HTTP timeout for memory service requests (milliseconds).
         *
         * Range: 50–60000
         */
        timeout_ms: number;
    };
    /**
     * Debug/dev features.
     *
     * These options are intended for local development and troubleshooting.
     */
    debug: {
        /**
         * When enabled, the gateway will dump the *full* upstream request body for each
         * model request under:
         *   <repo>/.eclia/debug/<sessionId>/
         */
        capture_upstream_requests: boolean;
        /**
         * When enabled, the gateway will attempt to recover tool calls from assistant
         * plaintext output (e.g. "Tool bash (calling): ...") if the upstream provider
         * fails to produce structured tool_calls.
         *
         * WARNING: This is a best-effort fallback intended for debugging and compatibility.
         */
        parse_assistant_output: boolean;
    };
    /**
     * Optional "skills" system.
     *
     * Skills are user-enabled capability packs stored under:
     *   <repo>/skills/<name>/skill.md
     *
     * NOTE: The config only tracks which skills are enabled.
     * Skill discovery/metadata is handled by the gateway at runtime.
     */
    skills: {
        /**
         * Names of enabled skills.
         *
         * IMPORTANT: the skill name must exactly match its directory name under /skills.
         */
        enabled: string[];
    };
    /**
     * Optional display names used by system-instruction template placeholders.
     */
    persona: {
        /**
         * Replaces {{USER_PREFERRED_NAME}} in _system.local.md / _system.md.
         */
        user_preferred_name?: string;
        /**
         * Replaces {{ASSISTANT_NAME}} in _system.local.md / _system.md.
         */
        assistant_name?: string;
    };
    inference: {
        /**
         * Effective system instruction (resolved from _system.local.md -> _system.md).
         */
        system_instruction?: string;
        provider: InferenceProviderId;
        openai_compat: {
            profiles: OpenAICompatProfile[];
        };
        anthropic: {
            profiles: AnthropicProfile[];
        };
        codex_oauth: {
            profiles: CodexOAuthProfile[];
        };
    };
    adapters: {
        discord: {
            enabled: boolean;
            app_id?: string;
            bot_token?: string;
            guild_ids?: string[];
            user_whitelist?: string[];
            force_global_commands?: boolean;
            /**
             * Default stream mode for the /eclia slash command when `verbose` is omitted.
             * - final: no intermediate streaming (default)
             * - full: stream intermediate output (tools/deltas)
             */
            default_stream_mode?: "full" | "final";
        };
        telegram: {
            enabled: boolean;
            bot_token?: string;
            /** Allowed Telegram user ids (applies to both private and group chats). */
            user_whitelist?: string[];
            /** Allowed Telegram group/supergroup chat ids (bot replies only when chat.id is in this list). */
            group_whitelist?: string[];
        };
    };
    /**
     * Tools exposed to the model.
     *
     * `enabled` controls which tools are included in model requests.
     * Tools not in this list are never sent to the upstream provider.
     */
    tools: {
        enabled: string[];
    };
    /**
     * Symphony flow engine (optional).
     * When enabled, dev:all launches the Symphony server.
     */
    symphony: {
        enabled: boolean;
        host: string;
        port: number;
    };
};
export type OpenAICompatProfile = {
    /**
     * Stable identifier used by UI/runtime routing.
     * Not shown to users.
     */
    id: string;
    /**
     * Display name (shown in the Console UI).
     */
    name: string;
    /**
     * Example: https://api.openai.com/v1
     */
    base_url: string;
    /**
     * Real upstream model id (NOT the UI route key).
     */
    model: string;
    /**
     * Secret (prefer local overrides).
     */
    api_key?: string;
    /**
     * Default: Authorization
     */
    auth_header?: string;
    /**
     * Wire format for the upstream API.
     *
     * - "completion" (default) — OpenAI Chat Completions API (/v1/chat/completions)
     * - "responses" — OpenAI Responses API (/v1/responses)
     */
    wire_format?: "completion" | "responses";
};
export type AnthropicProfile = {
    /**
     * Stable identifier used by UI/runtime routing.
     * Not shown to users.
     */
    id: string;
    /**
     * Display name (shown in the Console UI).
     */
    name: string;
    /**
     * Example: https://api.anthropic.com
     * (The gateway will call <base_url>/v1/messages by default.)
     */
    base_url: string;
    /**
     * Real upstream model id (NOT the UI route key).
     */
    model: string;
    /**
     * Secret (prefer local overrides).
     */
    api_key?: string;
    /**
     * Default: x-api-key
     */
    auth_header?: string;
    /**
     * Default: 2023-06-01
     */
    anthropic_version?: string;
};
export type CodexOAuthProfile = {
    /**
     * Stable identifier used by UI/runtime routing.
     */
    id: string;
    /**
     * Display name (shown in the Console UI).
     */
    name: string;
    /**
     * Real upstream model id (NOT the UI route key).
     */
    model: string;
    /**
     * Secret OAuth tokens (prefer local overrides).
     *
     * NOTE: for now we treat these as opaque strings; different backends may
     * return different token sets.
     */
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    /**
     * Epoch milliseconds, if known.
     */
    expires_at?: number;
};
export type EcliaConfigPatch = Partial<{
    codex_home: string;
    console: Partial<EcliaConfig["console"]>;
    api: Partial<EcliaConfig["api"]>;
    memory: Partial<EcliaConfig["memory"]>;
    debug: Partial<EcliaConfig["debug"]>;
    skills: Partial<EcliaConfig["skills"]>;
    tools: Partial<EcliaConfig["tools"]>;
    persona: Partial<EcliaConfig["persona"]>;
    inference: Partial<{
        system_instruction: string;
        provider: EcliaConfig["inference"]["provider"];
        openai_compat: Partial<{
            profiles: Array<Partial<Pick<OpenAICompatProfile, "id" | "name" | "base_url" | "model" | "api_key" | "auth_header">> & Pick<OpenAICompatProfile, "id">>;
        }>;
        anthropic: Partial<{
            profiles: Array<Partial<Pick<AnthropicProfile, "id" | "name" | "base_url" | "model" | "api_key" | "auth_header" | "anthropic_version">> & Pick<AnthropicProfile, "id">>;
        }>;
        codex_oauth: Partial<{
            profiles: Array<Partial<Pick<CodexOAuthProfile, "id" | "name" | "model" | "access_token" | "refresh_token" | "id_token" | "expires_at">> & Pick<CodexOAuthProfile, "id">>;
        }>;
    }>;
    adapters: Partial<{
        discord: Partial<EcliaConfig["adapters"]["discord"]>;
        telegram: Partial<EcliaConfig["adapters"]["telegram"]>;
    }>;
    symphony: Partial<EcliaConfig["symphony"]>;
}>;
export declare const DEFAULT_ECLIA_CONFIG: EcliaConfig;
