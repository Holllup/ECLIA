/**
 * Preflight port bind to detect common Windows issues:
 * - EACCES: reserved/excluded port (admin does not always help)
 * - EADDRINUSE: already used
 */
export declare function preflightListen(host: string, port: number): Promise<{
    ok: true;
} | {
    ok: false;
    error: string;
    hint?: string;
}>;
