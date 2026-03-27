/**
 * Ensure root-level system instruction files exist:
 * - _system.md (committed default)
 * - _system.local.md (gitignored local override, initialized from _system.md)
 */
export declare function ensureSystemInstructionFiles(rootDir?: string): {
    rootDir: string;
    systemPath: string;
    localPath: string;
    createdSystem: boolean;
    createdLocal: boolean;
};
export declare function readSystemInstruction(rootDir?: string): {
    rootDir: string;
    systemPath: string;
    localPath: string;
    text: string;
    source: "local" | "base" | "none";
};
export declare function writeSystemInstructionLocal(rootDir: string, text: string): void;
export declare function renderSystemInstructionTemplate(template: string, vars: {
    userPreferredName?: string;
    assistantName?: string;
}): string;
