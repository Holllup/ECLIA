import { ANTHROPIC_DEFAULT_AUTH_HEADER, ANTHROPIC_DEFAULT_BASE_URL, ANTHROPIC_DEFAULT_MODEL, ANTHROPIC_DEFAULT_VERSION, CODEX_OAUTH_DEFAULT_MODEL, DEFAULT_INFERENCE_PROVIDER, DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME, OPENAI_COMPAT_DEFAULT_AUTH_HEADER, OPENAI_COMPAT_DEFAULT_BASE_URL, OPENAI_COMPAT_DEFAULT_MODEL } from "./provider-defaults.js";
export const DEFAULT_ECLIA_CONFIG = {
    console: { host: "127.0.0.1", port: 5173 },
    api: { port: 8787 },
    memory: {
        enabled: false,
        host: "127.0.0.1",
        port: 8788,
        timeout_ms: 1200
    },
    debug: {
        capture_upstream_requests: false,
        parse_assistant_output: false
    },
    skills: {
        enabled: []
    },
    tools: {
        enabled: ["bash", "send", "web", "memory"]
    },
    persona: {},
    inference: {
        provider: DEFAULT_INFERENCE_PROVIDER,
        openai_compat: {
            profiles: [
                {
                    id: DEFAULT_PROFILE_ID,
                    name: DEFAULT_PROFILE_NAME,
                    base_url: OPENAI_COMPAT_DEFAULT_BASE_URL,
                    model: OPENAI_COMPAT_DEFAULT_MODEL,
                    auth_header: OPENAI_COMPAT_DEFAULT_AUTH_HEADER
                }
            ]
        },
        anthropic: {
            profiles: [
                {
                    id: DEFAULT_PROFILE_ID,
                    name: DEFAULT_PROFILE_NAME,
                    base_url: ANTHROPIC_DEFAULT_BASE_URL,
                    model: ANTHROPIC_DEFAULT_MODEL,
                    auth_header: ANTHROPIC_DEFAULT_AUTH_HEADER,
                    anthropic_version: ANTHROPIC_DEFAULT_VERSION
                }
            ]
        },
        codex_oauth: {
            profiles: [
                {
                    id: DEFAULT_PROFILE_ID,
                    name: DEFAULT_PROFILE_NAME,
                    // Codex app-server model id (not the UI route key).
                    model: CODEX_OAUTH_DEFAULT_MODEL
                }
            ]
        }
    },
    adapters: {
        discord: {
            enabled: false,
            guild_ids: [],
            user_whitelist: [],
            force_global_commands: false,
            default_stream_mode: "final"
        },
        telegram: {
            enabled: false,
            user_whitelist: [],
            group_whitelist: []
        }
    },
    symphony: {
        enabled: false,
        host: "127.0.0.1",
        port: 8800
    }
};
