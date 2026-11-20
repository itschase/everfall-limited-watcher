import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import type { ViteDevServer } from "vite";
import worker from "./index";
import { SCHEDULED_CRON_INTERVAL_MS } from "./shared/appConfig";

interface MemoryKVEntry {
  value: string | Uint8Array;
  metadata: Record<string, unknown> | null;
  expiresAt: number | null;
}

const DEV_KV_FILE = path.resolve(import.meta.dirname, "..", ".dev-kv.json");

function createMemoryKV(): KVNamespace {
  const store = new Map<string, MemoryKVEntry>();

  try {
    if (fs.existsSync(DEV_KV_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DEV_KV_FILE, "utf8")) as Record<
        string,
        { type: "string" | "bytes"; value: string; metadata: Record<string, unknown> | null; expiresAt: number | null }
      >;
      const now = Date.now();
      for (const [k, item] of Object.entries(parsed)) {
        if (item.expiresAt !== null && now >= item.expiresAt) continue;
        store.set(k, {
          value: item.type === "bytes" ? new Uint8Array(Buffer.from(item.value, "base64")) : item.value,
          metadata: item.metadata ?? null,
          expiresAt: item.expiresAt ?? null,
        });
      }
    }
  } catch (err) {
    console.warn("Could not restore local .dev-kv.json:", err);
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleFlush = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const serialized: Record<string, unknown> = {};
        const now = Date.now();
        for (const [k, entry] of store.entries()) {
          if (entry.expiresAt !== null && now >= entry.expiresAt) continue;
          serialized[k] =
            typeof entry.value === "string"
              ? { type: "string", value: entry.value, metadata: entry.metadata, expiresAt: entry.expiresAt }
              : {
                  type: "bytes",
                  value: Buffer.from(entry.value).toString("base64"),
                  metadata: entry.metadata,
                  expiresAt: entry.expiresAt,
                };
        }
        fs.writeFileSync(DEV_KV_FILE, JSON.stringify(serialized), "utf8");
      } catch (err) {
        console.warn("Could not persist local .dev-kv.json:", err);
      }
    }, 150);
  };

  const getValidEntry = (key: string): MemoryKVEntry | null => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry;
  };

  const toArrayBuffer = (val: string | Uint8Array): ArrayBuffer => {
    const bytes = typeof val === "string" ? new TextEncoder().encode(val) : val;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
  };

  return {
    async get(key: string, type?: "text" | "arrayBuffer"): Promise<any> {
      const entry = getValidEntry(key);
      if (!entry) return null;
      if (type === "arrayBuffer") {
        return toArrayBuffer(entry.value);
      }
      return typeof entry.value === "string"
        ? entry.value
        : new TextDecoder().decode(entry.value);
    },

    async getWithMetadata<Metadata = unknown>(
      key: string,
      _type: "arrayBuffer"
    ): Promise<{ value: ArrayBuffer | null; metadata: Metadata | null }> {
      const entry = getValidEntry(key);
      if (!entry) return { value: null, metadata: null };
      return {
        value: toArrayBuffer(entry.value),
        metadata: (entry.metadata as Metadata | null) ?? null,
      };
    },

    async put(
      key: string,
      value: string | ArrayBuffer | ArrayBufferView,
      options?: { expiration?: number; expirationTtl?: number; metadata?: Record<string, unknown> }
    ): Promise<void> {
      let storedValue: string | Uint8Array;
      if (typeof value === "string") {
        storedValue = value;
      } else if (value instanceof ArrayBuffer) {
        storedValue = new Uint8Array(value.slice(0));
      } else {
        storedValue = new Uint8Array(
          value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
        );
      }

      let expiresAt: number | null = null;
      if (options?.expirationTtl) {
        expiresAt = Date.now() + options.expirationTtl * 1000;
      } else if (options?.expiration) {
        expiresAt = options.expiration * 1000;
      }

      store.set(key, {
        value: storedValue,
        metadata: options?.metadata ?? null,
        expiresAt,
      });
      scheduleFlush();
    },

    async delete(key: string): Promise<void> {
      store.delete(key);
      scheduleFlush();
    },

    async list(options?: { prefix?: string; limit?: number; cursor?: string }) {
      const prefix = options?.prefix || "";
      const limit = options?.limit || 1000;
      const keys: { name: string; metadata?: unknown }[] = [];
      for (const key of store.keys()) {
        if (prefix && !key.startsWith(prefix)) continue;
        const entry = getValidEntry(key);
        if (!entry) continue;
        keys.push({ name: key, metadata: entry.metadata ?? undefined });
        if (keys.length >= limit) break;
      }
      return { keys, list_complete: true };
    },
  };
}

function createMemoryR2(kv: KVNamespace) {
  const prefix = "__r2__:";
  return {
    async head(key: string) {
      const res = await kv.getWithMetadata<{ contentType?: string; size?: number; uploadedAt?: number }>(
        prefix + key,
        "arrayBuffer"
      );
      if (!res.value) return null;
      const uploaded = res.metadata?.uploadedAt ? new Date(res.metadata.uploadedAt) : new Date();
      return {
        key,
        size: res.value.byteLength,
        etag: `dev-${res.value.byteLength}-${uploaded.getTime()}`,
        httpEtag: `"dev-${res.value.byteLength}-${uploaded.getTime()}"`,
        uploaded,
        httpMetadata: {
          contentType: res.metadata?.contentType || "image/webp",
        },
      };
    },
    async get(key: string) {
      const res = await kv.getWithMetadata<{ contentType?: string; uploadedAt?: number }>(
        prefix + key,
        "arrayBuffer"
      );
      if (!res.value) return null;
      const bytes = new Uint8Array(res.value);
      const uploaded = res.metadata?.uploadedAt ? new Date(res.metadata.uploadedAt) : new Date();
      return {
        key,
        size: bytes.byteLength,
        etag: `dev-${bytes.byteLength}-${uploaded.getTime()}`,
        httpEtag: `"dev-${bytes.byteLength}-${uploaded.getTime()}"`,
        uploaded,
        httpMetadata: {
          contentType: res.metadata?.contentType || "image/webp",
        },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
        async arrayBuffer() {
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        },
      };
    },
    async put(
      key: string,
      value: ArrayBuffer | ArrayBufferView | string | ReadableStream,
      options?: { httpMetadata?: { contentType?: string } }
    ) {
      let buf: ArrayBuffer;
      if (typeof value === "string") {
        buf = new TextEncoder().encode(value).buffer;
      } else if (value instanceof ArrayBuffer) {
        buf = value;
      } else if (ArrayBuffer.isView(value)) {
        buf = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
      } else {
        buf = await new Response(value).arrayBuffer();
      }
      await kv.put(prefix + key, buf, {
        metadata: {
          contentType: options?.httpMetadata?.contentType || "image/webp",
          uploadedAt: Date.now(),
        },
      });
    },
    async delete(key: string) {
      await kv.delete(prefix + key);
    },
  };
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
};

const DIST_CLIENT_DIR = path.resolve(import.meta.dirname, "..", "dist", "client");
const IS_PRODUCTION = process.env.NODE_ENV === "production";

let viteServerPromise: Promise<ViteDevServer | null> | null = null;
async function getViteDevServer(): Promise<ViteDevServer | null> {
  if (IS_PRODUCTION) return null;
  if (!viteServerPromise) {
    viteServerPromise = (async () => {
      try {
        const { createServer } = await import("vite");
        return await createServer({
          server: { middlewareMode: true, hmr: false },
          appType: "spa",
        });
      } catch (err) {
        console.warn("Vite dev middleware unavailable, falling back to dist/client:", err);
        return null;
      }
    })();
  }
  return viteServerPromise;
}

function serveFromDist(urlPath: string): Response {
  const cleanPath = urlPath.split("?")[0].replace(/^\/+/, "");
  const candidate = path.resolve(DIST_CLIENT_DIR, cleanPath);

  if (
    cleanPath &&
    candidate.startsWith(DIST_CLIENT_DIR) &&
    fs.existsSync(candidate) &&
    fs.statSync(candidate).isFile()
  ) {
    const ext = path.extname(candidate).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const buffer = fs.readFileSync(candidate);
    const cacheControl = cleanPath.startsWith("assets/")
      ? "public, max-age=31536000, immutable"
      : "no-store";
    return new Response(buffer, {
      status: 200,
      headers: { "Content-Type": contentType, "Cache-Control": cacheControl },
    });
  }

  const indexHtmlPath = path.join(DIST_CLIENT_DIR, "index.html");
  if (fs.existsSync(indexHtmlPath)) {
    return new Response(fs.readFileSync(indexHtmlPath), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  return new Response("Frontend build not found. Run npm run build.", { status: 404 });
}

function createAssetsFetcher(vite: ViteDevServer | null): Fetcher {
  return {
    async fetch(input: RequestInfo | URL): Promise<Response> {
      const reqUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const parsed = new URL(reqUrl, "http://localhost:3000");

      if (!vite) {
        return serveFromDist(parsed.pathname);
      }

      // Let Vite handle module/CSS/asset transforms or SPA index.html
      const pathname = parsed.pathname + parsed.search;
      if (
        pathname.startsWith("/src/") ||
        pathname.startsWith("/@") ||
        pathname.startsWith("/node_modules/") ||
        /\.(js|mjs|ts|tsx|css|svg|png|webp|ico|woff2?|map)$/i.test(parsed.pathname)
      ) {
        const result = await vite.transformRequest(parsed.pathname);
        if (result) {
          return new Response(result.code, {
            status: 200,
            headers: {
              "Content-Type": "application/javascript; charset=utf-8",
              "Cache-Control": "no-store",
            },
          });
        }
      }

      const rawHtmlPath = path.resolve(import.meta.dirname, "..", "index.html");
      if (fs.existsSync(rawHtmlPath)) {
        const rawHtml = fs.readFileSync(rawHtmlPath, "utf8");
        const transformed = await vite.transformIndexHtml(parsed.pathname, rawHtml);
        return new Response(transformed, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      }

      return serveFromDist(parsed.pathname);
    },
  };
}

const localKv = createMemoryKV();
const env: Record<string, any> = {
  DISCORD_BOT: localKv,
  MEDIA_BUCKET: createMemoryR2(localKv),
  DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID || "1571958001928245378",
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID || "1571958001928245378",
  DISCORD_PUBLIC_KEY:
    process.env.DISCORD_PUBLIC_KEY ||
    "b143dc5acc60aff5f7a95169189f10e36fcc3cddb288ee8b3849a22b5c2af1d9",
  DISCORD_PRIMARY_ADMINISTRATOR:
    process.env.DISCORD_PRIMARY_ADMINISTRATOR || "151037568484507648",
  DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET || "",
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || "",
  DISCORD_STORE_EMOJI_ID: process.env.DISCORD_STORE_EMOJI_ID || "",
  CRON_SECRET: process.env.CRON_SECRET || "",
  PUBLIC_ORIGIN:
    process.env.PUBLIC_ORIGIN || "https://everfall-limited-watcher.itschase.workers.dev",
  APP_URL:
    process.env.APP_URL ||
    "https://ais-dev-3sjbmvttwwkbyofdxfnnib-919377384435.us-east1.run.app",
};

const ctx: ExecutionContext = {
  waitUntil(promise: Promise<unknown>) {
    promise.catch((err) => console.error("Background task error:", err));
  },
  passThroughOnException() {},
};

function readRequestBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function isViteDirectRequest(urlPath: string): boolean {
  const clean = urlPath.split("?")[0];
  return (
    clean.startsWith("/@") ||
    clean.startsWith("/src/web/") ||
    clean.startsWith("/node_modules/")
  );
}

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

async function startServer() {
  const vite = await getViteDevServer();
  env.ASSETS = createAssetsFetcher(vite);

  const server = http.createServer(async (req, res) => {
    try {
      // Forward Vite HMR/transform internal module requests directly to Vite middleware in dev
      if (vite && req.url && isViteDirectRequest(req.url)) {
        vite.middlewares(req, res, () => {
          res.statusCode = 404;
          res.end("Not Found");
        });
        return;
      }

      const protoHeader = req.headers["x-forwarded-proto"];
      const protocol = (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader) || "http";
      const hostHeader = req.headers["x-forwarded-host"] || req.headers.host;
      const host = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader) || `localhost:${PORT}`;
      const url = `${protocol}://${host}${req.url || "/"}`;

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const item of value) headers.append(key, item);
        } else {
          headers.set(key, value);
        }
      }

      const method = req.method || "GET";
      const hasBody = method !== "GET" && method !== "HEAD";
      const bodyBuffer = hasBody ? await readRequestBody(req) : undefined;

      const webRequest = new Request(url, {
        method,
        headers,
        body: hasBody && bodyBuffer && bodyBuffer.length > 0 ? new Uint8Array(bodyBuffer) : undefined,
      });

      const webResponse = await worker.fetch(webRequest, env, ctx);

      const setCookies =
        typeof (webResponse.headers as any).getSetCookie === "function"
          ? ((webResponse.headers as any).getSetCookie() as string[])
          : [];

      const outHeaders: Record<string, string | string[]> = {};
      webResponse.headers.forEach((val, key) => {
        if (key.toLowerCase() === "set-cookie") return;
        outHeaders[key] = val;
      });
      if (setCookies.length > 0) {
        outHeaders["set-cookie"] = setCookies;
      }

      res.writeHead(webResponse.status, outHeaders);
      const responseBuffer = Buffer.from(await webResponse.arrayBuffer());
      res.end(responseBuffer);
    } catch (err) {
      console.error("Unhandled request error:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      res.end("Internal Server Error");
    }
  });

  // Mirror the automated store monitor cadence (every 7 minutes)
  setInterval(() => {
    worker.scheduled({}, env, ctx).catch((err) => {
      console.error("Scheduled cron error:", err);
    });
  }, SCHEDULED_CRON_INTERVAL_MS);

  server.listen(PORT, HOST, () => {
    console.log(`Everfall Limited Watcher listening on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
