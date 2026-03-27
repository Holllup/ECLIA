import { execFileSync } from "node:child_process";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
export function env(name, fallback) {
    const v = process.env[name];
    return (v ?? fallback ?? "").trim();
}
export function hasEnv(name) {
    const v = process.env[name];
    return typeof v === "string" && v.trim().length > 0;
}
export function boolEnv(name) {
    const v = env(name).toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
}
export function normalizeIdList(input) {
    const raw = [];
    if (Array.isArray(input)) {
        for (const x of input) {
            const s = typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : "";
            if (s)
                raw.push(s);
        }
    }
    else if (typeof input === "string") {
        for (const part of input.split(/[\n\r,\t\s]+/g)) {
            const s = part.trim();
            if (s)
                raw.push(s);
        }
    }
    // De-dup while preserving order.
    const seen = new Set();
    const uniq = [];
    for (const s of raw) {
        if (seen.has(s))
            continue;
        seen.add(s);
        uniq.push(s);
    }
    return uniq;
}
export function json(res, status, obj) {
    const body = JSON.stringify(obj, null, 2);
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(body);
}
export async function readJson(req) {
    const chunks = [];
    for await (const c of req)
        chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    const raw = Buffer.concat(chunks).toString("utf-8");
    if (!raw.trim())
        return {};
    try {
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
export function explainFetchError(e) {
    const msg = String(e?.message ?? e);
    const c = e && typeof e === "object" ? e.cause : null;
    if (c && typeof c === "object") {
        const code = c.code || c.errno;
        const cmsg = c.message;
        const parts = [code, cmsg].filter(Boolean).join(": ");
        return parts ? `${msg} (${parts})` : msg;
    }
    return msg;
}
// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
const ADAPTER_LOG_LABEL_PAD = 16;
function adapterLogPrefix(name) {
    const label = `adapter:${String(name ?? "").trim().toLowerCase() || "unknown"}`;
    return `[${label.padEnd(ADAPTER_LOG_LABEL_PAD, " ")}]`;
}
export function makeAdapterLogger(name) {
    const prefix = adapterLogPrefix(name);
    return {
        info: (...args) => console.log(prefix, ...args),
        warn: (...args) => console.warn(prefix, ...args),
        error: (...args) => console.error(prefix, ...args)
    };
}
let proxyBootstrapResult = null;
function readProxyEnv() {
    const httpProxy = (process.env.http_proxy ?? process.env.HTTP_PROXY ?? "").trim() || undefined;
    const httpsProxy = (process.env.https_proxy ?? process.env.HTTPS_PROXY ?? "").trim() || undefined;
    return { httpProxy, httpsProxy };
}
function parseScutilProxyOutput(raw) {
    const out = {};
    for (const line of String(raw ?? "").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.+?)\s*$/);
        if (!m)
            continue;
        out[m[1]] = m[2];
    }
    return out;
}
function detectMacOsSystemProxy() {
    if (process.platform !== "darwin")
        return null;
    try {
        const raw = execFileSync("scutil", ["--proxy"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        const parsed = parseScutilProxyOutput(raw);
        const httpProxy = parsed.HTTPEnable === "1" && parsed.HTTPProxy && parsed.HTTPPort
            ? `http://${parsed.HTTPProxy}:${parsed.HTTPPort}`
            : undefined;
        const httpsProxy = parsed.HTTPSEnable === "1" && parsed.HTTPSProxy && parsed.HTTPSPort
            ? `http://${parsed.HTTPSProxy}:${parsed.HTTPSPort}`
            : undefined;
        if (!httpProxy && !httpsProxy)
            return null;
        return { httpProxy, httpsProxy };
    }
    catch {
        return null;
    }
}
function ensureNoProxyDefaults() {
    const defaults = ["127.0.0.1", "localhost", "*.local"];
    const existing = (process.env.no_proxy ?? process.env.NO_PROXY ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    const merged = [...existing];
    for (const value of defaults) {
        if (!merged.includes(value))
            merged.push(value);
    }
    const out = merged.join(",");
    process.env.no_proxy = out;
    process.env.NO_PROXY = out;
}
export function bootstrapAutoProxy(log) {
    if (proxyBootstrapResult)
        return proxyBootstrapResult;
    let { httpProxy, httpsProxy } = readProxyEnv();
    let source = "none";
    if (httpProxy || httpsProxy) {
        source = "env";
    }
    else {
        const detected = detectMacOsSystemProxy();
        if (detected?.httpProxy || detected?.httpsProxy) {
            httpProxy = detected.httpProxy;
            httpsProxy = detected.httpsProxy;
            if (httpProxy) {
                process.env.http_proxy = httpProxy;
                process.env.HTTP_PROXY = httpProxy;
            }
            if (httpsProxy) {
                process.env.https_proxy = httpsProxy;
                process.env.HTTPS_PROXY = httpsProxy;
            }
            source = "macos_system";
        }
    }
    if (!httpProxy && !httpsProxy) {
        proxyBootstrapResult = { enabled: false, source: "none" };
        return proxyBootstrapResult;
    }
    ensureNoProxyDefaults();
    const originalEmitWarning = process.emitWarning.bind(process);
    try {
        process.emitWarning = ((warning, ...args) => {
            const code = typeof args[0] === "string" ? args[0] : args[0]?.code;
            if (code === "UNDICI-EHPA")
                return;
            return originalEmitWarning(warning, ...args);
        });
        setGlobalDispatcher(new EnvHttpProxyAgent());
    }
    finally {
        process.emitWarning = originalEmitWarning;
    }
    proxyBootstrapResult = {
        enabled: true,
        source,
        ...(httpProxy ? { httpProxy } : {}),
        ...(httpsProxy ? { httpsProxy } : {})
    };
    const proxyForLog = httpsProxy ?? httpProxy ?? "";
    if (log) {
        log(source === "macos_system"
            ? `using macOS system proxy for outbound network: ${proxyForLog}`
            : `using proxy from environment for outbound network: ${proxyForLog}`);
    }
    return proxyBootstrapResult;
}
