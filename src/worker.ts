import app from "./index";
import webpModule from "@jsquash/webp/codec/dec/webp_dec.wasm";
import { initWebp } from "./eventImage";

// Workers require a bundled, precompiled Wasm module; the Node runtime initializes
// the same decoder from disk in server.ts.
await initWebp(webpModule);
export default app;
