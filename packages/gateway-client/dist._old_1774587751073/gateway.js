import path from "node:path";
import * as fs from "node:fs";
import { loadEcliaConfig } from "@eclia/config";
import { env, explainFetchError } from "./utils.js";
// ---------------------------------------------------------------------------
// Gateway URL & auth
// ---------------------------------------------------------------------------
export function guessGatewayUrl() {
    const explicit = env("ECLIA_GATEWAY_URL");
    if (explicit)
        return explicit;
    const { config } = loadEcliaConfig(process.cwd());
    return `http://127.0.0.1:${config.api.port}`;
}
let cachedGatewayToken = null;
function readGatewayToken() {
    const explicit = env("ECLIA_GATEWAY_TOKEN");
    if (explicit)
        return explicit;
    try {
        const { rootDir } = loadEcliaConfig(process.cwd());
        const tokenPath = path.join(rootDir, ".eclia", "gateway.token");
        return fs.readFileSync(tokenPath, "utf-8").trim();
    }
    catch {
        return "";
    }
}
export function getGatewayToken() {
    if (cachedGatewayToken && cachedGatewayToken.trim())
        return cachedGatewayToken;
    const t = readGatewayToken();
    if (t)
        cachedGatewayToken = t;
    return t;
}
export function withGatewayAuth(headers) {
    const t = getGatewayToken();
    return t ? { ...headers, Authorization: `Bearer ${t}` } : headers;
}
// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------
export async function ensureGatewaySession(gatewayUrl, sessionId, title, origin, opts) {
    const r = await fetch(`${gatewayUrl}/api/sessions`, {
        method: "POST",
        headers: withGatewayAuth({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: sessionId, title, origin, hideInMenuSheet: opts?.hideInMenuSheet })
    });
    const j = (await r.json().catch(() => null));
    if (!j?.ok)
        throw new Error(`failed_to_create_session: ${j?.error ?? r.status}`);
    return j.session;
}
export async function resetGatewaySession(gatewayUrl, sessionId) {
    const r = await fetch(`${gatewayUrl}/api/sessions/${encodeURIComponent(sessionId)}/reset`, {
        method: "POST",
        headers: withGatewayAuth({ "Content-Type": "application/json" })
    });
    const j = (await r.json().catch(() => null));
    if (!j?.ok)
        throw new Error(`failed_to_reset_session: ${j?.error ?? r.status}`);
    return j.session;
}
// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------
export function coerceStreamMode(v) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s === "full" || s === "final")
        return s;
    return null;
}
export async function* iterSse(resp) {
    if (!resp.body)
        return;
    const decoder = new TextDecoder();
    let buf = "";
    for await (const chunk of resp.body) {
        buf += decoder.decode(chunk, { stream: true });
        while (true) {
            const idx = buf.indexOf("\n\n");
            if (idx < 0)
                break;
            const part = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            let event = "message";
            const dataLines = [];
            for (const line of part.split("\n")) {
                if (line.startsWith("event:"))
                    event = line.slice("event:".length).trim();
                if (line.startsWith("data:"))
                    dataLines.push(line.slice("data:".length).trimStart());
            }
            yield { event, data: dataLines.join("\n") };
        }
    }
}
// ---------------------------------------------------------------------------
// runGatewayChat
// ---------------------------------------------------------------------------
export async function runGatewayChat(args) {
    let resp;
    try {
        resp = await fetch(`${args.gatewayUrl}/api/chat`, {
            method: "POST",
            headers: withGatewayAuth({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                sessionId: args.sessionId,
                userText: args.userText,
                model: args.model,
                toolAccessMode: args.toolAccessMode ?? "full",
                streamMode: args.streamMode ?? (args.onRecord ? "full" : "final"),
                ...(Array.isArray(args.enabledTools) ? { enabledTools: args.enabledTools } : {}),
                ...(Array.isArray(args.messages) ? { messages: args.messages } : {}),
                ...(typeof args.systemInstructionOverride === "string" ? { systemInstructionOverride: args.systemInstructionOverride } : {}),
                ...(typeof args.skipMemoryRecall === "boolean" ? { skipMemoryRecall: args.skipMemoryRecall } : {}),
                ...(typeof args.includeHistory === "boolean" ? { includeHistory: args.includeHistory } : {}),
                ...(typeof args.contextTokenLimit === "number" ? { contextTokenLimit: args.contextTokenLimit } : {}),
                ...(typeof args.temperature === "number" ? { temperature: args.temperature } : {}),
                ...(typeof args.topP === "number" ? { topP: args.topP } : {}),
                ...(typeof args.topK === "number" ? { topK: args.topK } : {}),
                ...(args.operationMode ? { operationMode: args.operationMode } : {}),
                ...(args.rawMode ? { rawMode: true } : {}),
                origin: args.origin
            })
        });
    }
    catch (e) {
        throw new Error(`fetch_failed: ${explainFetchError(e)}`);
    }
    if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        throw new Error(`gateway_http_${resp.status}: ${t ? t.slice(0, 240) : resp.statusText}`);
    }
    const onRecord = typeof args.onRecord === "function" ? args.onRecord : null;
    // Serialize adapter-side record emissions to preserve ordering, but DO NOT
    // await within the SSE loop. Awaiting sends here can stall consumption of
    // the gateway response stream and trigger undici/Fetch "terminated" errors.
    let recordQueue = Promise.resolve();
    const enqueueRecord = (rec) => {
        if (!onRecord)
            return;
        recordQueue = recordQueue
            .then(() => onRecord(rec))
            .catch(() => {
            // Swallow adapter-side send failures.
        });
    };
    const drainRecords = async () => {
        if (!onRecord)
            return;
        await recordQueue;
    };
    let current = "";
    let lastCompleted = "";
    let finalText = "";
    let meta = undefined;
    // Record-level streaming state.
    let pendingAssistantText = null;
    let pendingAssistantToolCalls = [];
    let assistantFlushTimer = null;
    const ASSISTANT_FLUSH_DELAY_MS = 250;
    const clearAssistantFlushTimer = () => {
        if (assistantFlushTimer)
            clearTimeout(assistantFlushTimer);
        assistantFlushTimer = null;
    };
    const flushAssistantRecord = (reason) => {
        clearAssistantFlushTimer();
        if (!onRecord)
            return;
        if (pendingAssistantText === null)
            return;
        const toolCalls = pendingAssistantToolCalls;
        const text = pendingAssistantText;
        pendingAssistantText = null;
        pendingAssistantToolCalls = [];
        enqueueRecord({ type: "assistant", text, toolCalls, reason });
    };
    const scheduleAssistantFlush = () => {
        if (!onRecord)
            return;
        clearAssistantFlushTimer();
        assistantFlushTimer = setTimeout(() => {
            flushAssistantRecord("debounce");
        }, ASSISTANT_FLUSH_DELAY_MS);
    };
    let sseError = null;
    try {
        for await (const ev of iterSse(resp)) {
            if (ev.event === "meta") {
                try {
                    meta = JSON.parse(ev.data);
                }
                catch {
                    /* ignore */
                }
            }
            if (ev.event === "assistant_start") {
                flushAssistantRecord("assistant_start");
                current = "";
            }
            if (ev.event === "delta") {
                try {
                    const j = JSON.parse(ev.data);
                    const text = typeof j?.text === "string" ? j.text : "";
                    if (text)
                        current += text;
                }
                catch {
                    // ignore malformed chunks
                }
            }
            if (ev.event === "assistant_end") {
                lastCompleted = current;
                if (onRecord) {
                    pendingAssistantText = current;
                    current = "";
                    scheduleAssistantFlush();
                }
            }
            if (ev.event === "tool_call") {
                if (onRecord) {
                    try {
                        const j = JSON.parse(ev.data);
                        pendingAssistantToolCalls.push(j);
                        scheduleAssistantFlush();
                    }
                    catch {
                        // ignore malformed tool_call blocks
                    }
                }
            }
            if (ev.event === "tool_result") {
                if (onRecord) {
                    flushAssistantRecord("tool_result");
                    try {
                        const j = JSON.parse(ev.data);
                        enqueueRecord({ type: "tool_result", ...j });
                    }
                    catch {
                        enqueueRecord({
                            type: "tool_result",
                            name: "(unknown)",
                            callId: "(unknown)",
                            ok: false,
                            result: { ok: false, error: { code: "bad_event", message: "Malformed tool_result event" } }
                        });
                    }
                }
            }
            if (ev.event === "final") {
                try {
                    const j = JSON.parse(ev.data);
                    const text = typeof j?.text === "string" ? j.text : "";
                    if (text)
                        finalText = text;
                }
                catch {
                    // ignore
                }
            }
            if (ev.event === "error") {
                if (onRecord)
                    flushAssistantRecord("error");
                try {
                    const j = JSON.parse(ev.data);
                    throw new Error(String(j?.message ?? "gateway_error"));
                }
                catch (e) {
                    throw new Error(String(e?.message ?? e));
                }
            }
            if (ev.event === "done") {
                if (onRecord)
                    flushAssistantRecord("done");
                break;
            }
        }
    }
    catch (e) {
        sseError = e;
    }
    finally {
        flushAssistantRecord("eof");
        await drainRecords();
    }
    if (sseError)
        throw sseError;
    const text = (finalText || lastCompleted || current).trim();
    return { text, meta };
}
// ---------------------------------------------------------------------------
// Artifact fetching
// ---------------------------------------------------------------------------
export async function fetchArtifactBytes(gatewayUrl, relPath) {
    const u = new URL(`${gatewayUrl}/api/artifacts`);
    u.searchParams.set("path", relPath);
    const r = await fetch(u, { headers: withGatewayAuth({}) });
    if (!r.ok)
        throw new Error(`artifact_fetch_failed (${r.status})`);
    const ab = await r.arrayBuffer();
    return Buffer.from(ab);
}
