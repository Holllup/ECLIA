/**
 * Find repository/project root from any working directory.
 * We treat the directory containing eclia.config.toml (or a .git folder) as root.
 */
export declare function findProjectRoot(startDir?: string): string;
