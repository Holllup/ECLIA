import type { EcliaConfig, EcliaConfigPatch } from "./types.js";
/**
 * Ensure eclia.config.local.toml exists.
 * This is intentionally best-effort: failures should not crash dev startup.
 */
export declare function ensureLocalConfig(rootDir?: string): {
    rootDir: string;
    localPath: string;
    created: boolean;
};
export declare function loadEcliaConfig(startDir?: string): {
    rootDir: string;
    configPath: string;
    localPath: string;
    config: EcliaConfig;
    raw: Record<string, any>;
};
/**
 * Write a patch into eclia.config.local.toml.
 *
 * Safety rule:
 * - preserve unknown keys/sections (do not wipe inference keys just to update host/port).
 * - normalize known keys for type safety.
 */
export declare function writeLocalEcliaConfig(patch: EcliaConfigPatch, startDir?: string): {
    rootDir: string;
    localPath: string;
    config: EcliaConfig;
};
/**
 * Low-level read-modify-write on eclia.config.local.toml.
 *
 * Unlike writeLocalEcliaConfig, this does NOT normalize or rebuild known sections.
 * It simply reads the local TOML, passes the parsed object to `mutate` for
 * in-place edits, and writes the result back.
 */
export declare function patchLocalToml(rootDir: string, mutate: (obj: Record<string, any>) => void): void;
