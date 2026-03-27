/**
 * Ensure root-level memory injection template files exist:
 * - _system_memory.md (committed default)
 * - _system_memory.local.md (gitignored local override, initialized from base)
 */
export declare function ensureSystemMemoryTemplateFiles(rootDir?: string): {
    rootDir: string;
    templatePath: string;
    localPath: string;
    createdTemplate: boolean;
    createdLocal: boolean;
};
export declare function readSystemMemoryTemplate(rootDir?: string): {
    rootDir: string;
    templatePath: string;
    localPath: string;
    text: string;
    source: "local" | "base" | "none";
};
export declare function renderSystemMemoryTemplate(template: string, vars: {
    memoryProfile: string;
    userPreferredName?: string;
    assistantName?: string;
}): string;
