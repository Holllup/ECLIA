export function isRecord(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
export function asString(v) {
    if (typeof v === "string")
        return v;
    if (typeof v === "number")
        return String(v);
    return "";
}
export function clampInt(v, min, max, fallback) {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (!Number.isFinite(n))
        return fallback;
    const i = Math.trunc(n);
    return Math.max(min, Math.min(max, i));
}
export function safeJsonStringify(v) {
    try {
        return JSON.stringify(v);
    }
    catch {
        return String(v);
    }
}
