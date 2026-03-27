/**
 * Ensure root-level skills template files exist:
 * - _system_skills.md (committed default)
 * - _system_skills.local.md (gitignored local override, initialized from base)
 */
export declare function ensureSystemSkillsTemplateFiles(rootDir?: string): {
    rootDir: string;
    templatePath: string;
    localPath: string;
    createdTemplate: boolean;
    createdLocal: boolean;
};
export declare function readSystemSkillsTemplate(rootDir?: string): {
    rootDir: string;
    templatePath: string;
    localPath: string;
    text: string;
    source: "local" | "base" | "none";
};
export declare function renderSystemSkillsTemplate(template: string, vars: {
    userPreferredName?: string;
    assistantName?: string;
}): string;
