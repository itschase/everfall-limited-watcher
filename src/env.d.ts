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

interface R2HTTPMetadata {
  contentType?: string;
}

interface R2PutOptions {
  httpMetadata?: R2HTTPMetadata;
}

interface R2Object {
  key: string;
  size: number;
  etag: string;
  httpEtag?: string;
  uploaded: Date;
  httpMetadata?: R2HTTPMetadata;
}

interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface R2Bucket {
  head(key: string): Promise<R2Object | null>;
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream,
    options?: R2PutOptions
  ): Promise<R2Object | void | null>;
  delete(key: string): Promise<void>;
}

