interface KVGetWithMetadataResult<T, Metadata = unknown> {
  value: T | null;
  metadata: Metadata | null;
}

interface KVPutOptions {
  expiration?: number;
  expirationTtl?: number;
  metadata?: Record<string, unknown>;
}

interface KVListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

interface KVListResult {
  keys: { name: string; expiration?: number; metadata?: unknown }[];
  list_complete: boolean;
  cursor?: string;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  get(key: string, type: "text"): Promise<string | null>;
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  getWithMetadata<Metadata = unknown>(
    key: string,
    type: "arrayBuffer"
  ): Promise<KVGetWithMetadataResult<ArrayBuffer, Metadata>>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView,
    options?: KVPutOptions
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list?(options?: KVListOptions): Promise<KVListResult>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
