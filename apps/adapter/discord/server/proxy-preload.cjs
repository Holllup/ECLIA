const { execFileSync } = require("node:child_process");

function readProxyEnv() {
  const httpProxy = (process.env.http_proxy || process.env.HTTP_PROXY || "").trim();
  const httpsProxy = (process.env.https_proxy || process.env.HTTPS_PROXY || "").trim();
  return {
    httpProxy: httpProxy || undefined,
    httpsProxy: httpsProxy || undefined
  };
}

function parseScutilProxyOutput(raw) {
  const out = {};
  for (const line of String(raw || "").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2];
  }
  return out;
}

function detectMacOsSystemProxy() {
  if (process.platform !== "darwin") return null;
  try {
    const raw = execFileSync("scutil", ["--proxy"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const parsed = parseScutilProxyOutput(raw);

    const httpProxy =
      parsed.HTTPEnable === "1" && parsed.HTTPProxy && parsed.HTTPPort
        ? `http://${parsed.HTTPProxy}:${parsed.HTTPPort}`
        : undefined;
    const httpsProxy =
      parsed.HTTPSEnable === "1" && parsed.HTTPSProxy && parsed.HTTPSPort
        ? `http://${parsed.HTTPSProxy}:${parsed.HTTPSPort}`
        : undefined;

    if (!httpProxy && !httpsProxy) return null;
    return { httpProxy, httpsProxy };
  } catch {
    return null;
  }
}

function ensureNoProxyDefaults() {
  const defaults = ["127.0.0.1", "localhost", "*.local"];
  const existing = (process.env.no_proxy || process.env.NO_PROXY || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const merged = [...existing];
  for (const value of defaults) {
    if (!merged.includes(value)) merged.push(value);
  }
  const out = merged.join(",");
  process.env.no_proxy = out;
  process.env.NO_PROXY = out;
}

function shouldBypassProxy(targetUrl) {
  try {
    const url = new URL(String(targetUrl));
    const host = (url.hostname || "").toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host.endsWith(".local");
  } catch {
    return false;
  }
}

function bootstrapProxyEnv() {
  let { httpProxy, httpsProxy } = readProxyEnv();
  if (!httpProxy && !httpsProxy) {
    const detected = detectMacOsSystemProxy();
    if (detected) {
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
    }
  }

  if (!httpProxy && !httpsProxy) return null;
  ensureNoProxyDefaults();
  return { httpProxy, httpsProxy };
}

function patchWsProxy(proxy) {
  if (!proxy?.httpProxy && !proxy?.httpsProxy) return;

  const ws = require("ws");
  const { HttpsProxyAgent } = require("https-proxy-agent");
  const BaseWebSocket = ws.WebSocket;
  if (!BaseWebSocket || BaseWebSocket.__ecliaProxyPatched) return;

  function ProxyWebSocket(address, protocols, options = {}) {
    const proxyUrl = String(address).startsWith("wss:") ? (proxy.httpsProxy || proxy.httpProxy) : proxy.httpProxy;
    const nextOptions =
      proxyUrl && !options.agent && !shouldBypassProxy(address)
        ? { ...options, agent: new HttpsProxyAgent(proxyUrl) }
        : options;
    return new BaseWebSocket(address, protocols, nextOptions);
  }

  ProxyWebSocket.__ecliaProxyPatched = true;
  ProxyWebSocket.prototype = BaseWebSocket.prototype;
  for (const key of Object.getOwnPropertyNames(BaseWebSocket)) {
    if (key === "length" || key === "name" || key === "prototype") continue;
    Object.defineProperty(ProxyWebSocket, key, Object.getOwnPropertyDescriptor(BaseWebSocket, key));
  }
  ws.WebSocket = ProxyWebSocket;
}

patchWsProxy(bootstrapProxyEnv());
