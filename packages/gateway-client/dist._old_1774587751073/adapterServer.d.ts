export declare function extractRefToRepoRelPath(pointer: string): {
    relPath: string;
    name: string;
} | null;
export declare function parseToolAccessMode(raw: string): "safe" | "full";
export declare function installProcessErrorHandlers(name: string): void;
