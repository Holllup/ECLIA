/**
 * Best-effort read a text file; returns null if missing or unreadable.
 */
export declare function tryReadText(filePath: string): string | null;
/**
 * Ensure a committed template file and its `.local` override both exist.
 * If the committed file is missing, it is created from `defaultContent`.
 * If the local file is missing, it is initialized from the committed file.
 */
export declare function ensureTemplateFiles(rootDir: string, baseName: string, localName: string, defaultContent: string): {
    templatePath: string;
    localPath: string;
    createdTemplate: boolean;
    createdLocal: boolean;
};
/**
 * Read a template with local-override-first fallback.
 */
export declare function readTemplate(rootDir: string, baseName: string, localName: string): {
    templatePath: string;
    localPath: string;
    text: string;
    source: "local" | "base" | "none";
};
