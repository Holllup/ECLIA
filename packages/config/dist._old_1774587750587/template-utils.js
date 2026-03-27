import fs from "node:fs";
import path from "node:path";
/**
 * Best-effort read a text file; returns null if missing or unreadable.
 */
export function tryReadText(filePath) {
    try {
        if (!fs.existsSync(filePath))
            return null;
        const st = fs.statSync(filePath);
        if (!st.isFile())
            return null;
        return fs.readFileSync(filePath, "utf-8");
    }
    catch {
        return null;
    }
}
/**
 * Ensure a committed template file and its `.local` override both exist.
 * If the committed file is missing, it is created from `defaultContent`.
 * If the local file is missing, it is initialized from the committed file.
 */
export function ensureTemplateFiles(rootDir, baseName, localName, defaultContent) {
    const templatePath = path.join(rootDir, baseName);
    const localPath = path.join(rootDir, localName);
    let createdTemplate = false;
    let createdLocal = false;
    if (!fs.existsSync(templatePath)) {
        try {
            fs.writeFileSync(templatePath, defaultContent, { encoding: "utf-8", flag: "wx" });
            createdTemplate = true;
        }
        catch {
            // best-effort
        }
    }
    if (!fs.existsSync(localPath)) {
        try {
            const base = tryReadText(templatePath) ?? "";
            fs.writeFileSync(localPath, base, { encoding: "utf-8", flag: "wx" });
            createdLocal = true;
        }
        catch {
            // best-effort
        }
    }
    return { templatePath, localPath, createdTemplate, createdLocal };
}
/**
 * Read a template with local-override-first fallback.
 */
export function readTemplate(rootDir, baseName, localName) {
    const templatePath = path.join(rootDir, baseName);
    const localPath = path.join(rootDir, localName);
    const localText = tryReadText(localPath);
    if (localText !== null)
        return { templatePath, localPath, text: localText, source: "local" };
    const baseText = tryReadText(templatePath);
    if (baseText !== null)
        return { templatePath, localPath, text: baseText, source: "base" };
    return { templatePath, localPath, text: "", source: "none" };
}
