export type SseEvent = {
    event: string;
    data: string;
};
export type TranscriptRecord = {
    type: "assistant";
    text: string;
    toolCalls: any[];
    /** Internal: helpful for debugging adapter-side ordering issues. */
    reason: string;
} | {
    type: "tool_result";
    callId: string;
    name: string;
    ok: boolean;
    result: any;
};
export declare function guessGatewayUrl(): string;
export declare function getGatewayToken(): string;
export declare function withGatewayAuth(headers: Record<string, string>): Record<string, string>;
export declare function ensureGatewaySession(gatewayUrl: string, sessionId: string, title: string, origin: any, opts?: {
    hideInMenuSheet?: boolean;
}): Promise<any>;
export declare function resetGatewaySession(gatewayUrl: string, sessionId: string): Promise<any>;
export declare function coerceStreamMode(v: unknown): "full" | "final" | null;
export declare function iterSse(resp: Response): AsyncGenerator<SseEvent>;
export declare function runGatewayChat(args: {
    gatewayUrl: string;
    sessionId: string;
    /** User message text. Required unless `rawMode` is true. */
    userText: string;
    model?: string;
    toolAccessMode?: "safe" | "full";
    streamMode?: "full" | "final";
    /** Optional list of tool names to expose to the model for this request (e.g. ["send"]). */
    enabledTools?: string[];
    /** Optional explicit context messages (role-structured). When provided, used as upstream context instead of stored session history. */
    messages?: Array<{
        role: "system" | "user" | "assistant" | "tool";
        content: any;
        name?: string;
        tool_call_id?: string;
    }>;
    /** Optional override for the upstream system instruction (bypasses the gateway's default system prompt injection). */
    systemInstructionOverride?: string;
    /** When true, the gateway will skip its built-in memory recall step for this request. */
    skipMemoryRecall?: boolean;
    origin?: any;
    /** When false, gateway will not include prior session history in upstream context. */
    includeHistory?: boolean;
    /** Optional override for the gateway's context token limit (conservative estimate). */
    contextTokenLimit?: number;
    /** Sampling temperature override (0–2). */
    temperature?: number;
    /** Nucleus sampling override (0–1). */
    topP?: number;
    /** Top-K sampling override (1–1000). */
    topK?: number;
    /** Operation mode: "chat" (default) or "computer_use". */
    operationMode?: "chat" | "computer_use";
    /** When true (and `messages` is provided), gateway uses the messages array as-is — no system prompt injection, no memory recall, no userMsg append. */
    rawMode?: boolean;
    onRecord?: (record: TranscriptRecord) => Promise<void>;
}): Promise<{
    text: string;
    meta?: any;
}>;
export declare function fetchArtifactBytes(gatewayUrl: string, relPath: string): Promise<Buffer>;
