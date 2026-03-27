export async function fetchJson(url, init) {
    const { timeoutMs, ...rest } = init;
    let timer = null;
    const ctrl = new AbortController();
    // Respect an upstream signal if provided.
    const upstreamSignal = rest.signal;
    if (upstreamSignal) {
        if (upstreamSignal.aborted)
            ctrl.abort();
        else
            upstreamSignal.addEventListener("abort", () => ctrl.abort(), { once: true });
    }
    try {
        timer = setTimeout(() => ctrl.abort(), timeoutMs);
        const resp = await fetch(url, { ...rest, signal: ctrl.signal });
        const status = resp.status;
        let data = null;
        try {
            data = await resp.json();
        }
        catch {
            data = null;
        }
        return { ok: resp.ok, status, data };
    }
    catch {
        return null;
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
