export const INFERENCE_PROVIDER_OPENAI_COMPAT = "openai_compat";
export const INFERENCE_PROVIDER_ANTHROPIC = "anthropic";
export const INFERENCE_PROVIDER_CODEX_OAUTH = "codex_oauth";
export const INFERENCE_PROVIDER_IDS = [
    INFERENCE_PROVIDER_OPENAI_COMPAT,
    INFERENCE_PROVIDER_ANTHROPIC,
    INFERENCE_PROVIDER_CODEX_OAUTH
];
const INFERENCE_PROVIDER_SET = new Set(INFERENCE_PROVIDER_IDS);
export function isInferenceProviderId(v) {
    return typeof v === "string" && INFERENCE_PROVIDER_SET.has(v);
}
export const DEFAULT_INFERENCE_PROVIDER = INFERENCE_PROVIDER_OPENAI_COMPAT;
export const WEB_PROVIDER_TAVILY = "tavily";
export const WEB_PROVIDER_IDS = [WEB_PROVIDER_TAVILY];
const WEB_PROVIDER_SET = new Set(WEB_PROVIDER_IDS);
export function isWebProviderId(v) {
    return typeof v === "string" && WEB_PROVIDER_SET.has(v);
}
export const DEFAULT_WEB_PROVIDER = WEB_PROVIDER_TAVILY;
export const DEFAULT_PROFILE_ID = "default";
export const DEFAULT_PROFILE_NAME = "Default";
export const OPENAI_COMPAT_DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const OPENAI_COMPAT_DEFAULT_MODEL = "gpt-5";
export const OPENAI_COMPAT_DEFAULT_AUTH_HEADER = "Authorization";
export const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com";
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-6";
export const ANTHROPIC_DEFAULT_AUTH_HEADER = "x-api-key";
export const ANTHROPIC_DEFAULT_VERSION = "2023-06-01";
export const CODEX_OAUTH_DEFAULT_MODEL = "gpt-5.3-codex";
