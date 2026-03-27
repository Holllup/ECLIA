import type { AnthropicProfile, CodexOAuthProfile, EcliaConfig, OpenAICompatProfile } from "./types.js";
/**
 * Utility: join base_url with a path (avoid double slashes).
 */
export declare function joinUrl(baseUrl: string, pathSuffix: string): string;
/**
 * Resolve the actual upstream model id from a UI route key.
 * The UI uses friendly "route" strings; upstream wants real model ids.
 */
export declare function resolveUpstreamModel(routeKey: string, config: EcliaConfig): string;
export type InferenceSelection = {
    kind: "openai_compat";
    profile: OpenAICompatProfile;
    upstreamModel: string;
} | {
    kind: "anthropic";
    profile: AnthropicProfile;
    upstreamModel: string;
} | {
    kind: "codex_oauth";
    profile: CodexOAuthProfile;
    upstreamModel: string;
};
/**
 * Resolve which upstream backend should be used for a given runtime route key.
 *
 * Today we support:
 * - OpenAI-compatible profiles: openai-compatible:<profile-id>
 * - Anthropic profiles: anthropic:<profile-id>
 * - Codex OAuth profiles: codex-oauth:<profile-id>
 */
export declare function resolveInferenceSelection(routeKey: string, config: EcliaConfig): InferenceSelection;
export declare function resolveAnthropicSelection(routeKey: string, config: EcliaConfig): {
    profile: AnthropicProfile;
    upstreamModel: string;
};
export declare function resolveCodexOAuthSelection(routeKey: string, config: EcliaConfig): {
    profile: CodexOAuthProfile;
    upstreamModel: string;
};
export declare function resolveOpenAICompatSelection(routeKey: string, config: EcliaConfig): {
    profile: OpenAICompatProfile;
    upstreamModel: string;
};
