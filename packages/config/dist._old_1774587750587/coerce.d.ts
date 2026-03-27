import type { EcliaConfig } from "./types.js";
export declare function isRecord(v: unknown): v is Record<string, unknown>;
export declare function coerceOptionalString(v: unknown): string | undefined;
export declare function coerceProfileId(v: unknown, fallback: string): string;
export declare function coerceStringArray(v: unknown, fallback?: string[]): string[];
export declare function deepMerge(a: Record<string, any>, b: Record<string, any>): Record<string, any>;
export declare function coerceConfig(raw: Record<string, any>): EcliaConfig;
