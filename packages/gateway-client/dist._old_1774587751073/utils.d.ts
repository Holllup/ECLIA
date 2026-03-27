import http from "node:http";
export declare function env(name: string, fallback?: string): string;
export declare function hasEnv(name: string): boolean;
export declare function boolEnv(name: string): boolean;
export declare function normalizeIdList(input: unknown): string[];
export declare function json(res: http.ServerResponse, status: number, obj: unknown): void;
export declare function readJson(req: http.IncomingMessage): Promise<any>;
export declare function explainFetchError(e: any): string;
export declare function makeAdapterLogger(name: string): {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
};
type ProxyBootstrapResult = {
    enabled: boolean;
    source: "none" | "env" | "macos_system";
    httpProxy?: string;
    httpsProxy?: string;
};
export declare function bootstrapAutoProxy(log?: (message: string) => void): ProxyBootstrapResult;
export {};
