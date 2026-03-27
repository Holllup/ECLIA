export declare function fetchJson(url: string, init: RequestInit & {
    timeoutMs: number;
}): Promise<{
    ok: boolean;
    status: number;
    data: any;
} | null>;
