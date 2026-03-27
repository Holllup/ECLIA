import type { EcliaConfig } from "./types.js";
export declare const ROUTE_KEY_OPENAI_COMPAT_PREFIX = "openai-compatible";
export declare const ROUTE_KEY_ANTHROPIC_COMPAT_PREFIX = "anthropic-compatible";
export declare const ROUTE_KEY_ANTHROPIC_LEGACY_PREFIX = "anthropic";
export declare const ROUTE_KEY_CODEX_OAUTH_PREFIX = "codex-oauth";
export type RouteKeyDefaults = {
    openaiProfileId?: string;
    anthropicProfileId?: string;
    codexOAuthProfileId?: string;
};
export type ParsedRouteKey = {
    kind: "openai_compat";
    raw: string;
    profileId?: string;
    source: "openai-profile" | "openai-shorthand" | "openai-legacy-router-gateway" | "openai-legacy-local-ollama" | "empty";
} | {
    kind: "anthropic";
    raw: string;
    profileId?: string;
    source: "anthropic-profile" | "anthropic-shorthand";
} | {
    kind: "codex_oauth";
    raw: string;
    profileId?: string;
    source: "codex-profile" | "codex-shorthand";
} | {
    kind: "raw_model";
    raw: string;
    source: "raw-model-id";
};
export declare function openaiCompatProfileRouteKey(profileId: string): string;
export declare function anthropicProfileRouteKey(profileId: string): string;
export declare function codexOAuthProfileRouteKey(profileId: string): string;
export declare function parseRouteKey(routeKey: string): ParsedRouteKey;
export declare function routeKeyDefaultsFromConfig(config: EcliaConfig): Required<RouteKeyDefaults>;
export declare function canonicalizeRouteKey(routeKey: string, defaults?: RouteKeyDefaults): string;
export declare function canonicalizeRouteKeyForConfig(routeKey: string, config: EcliaConfig): string;
