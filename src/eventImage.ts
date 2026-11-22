import { decode as decodePng } from "fast-png";
import jpeg from "jpeg-js";
import decodeWebp, { init as initWebp } from "@jsquash/webp/decode.js";

export { initWebp };
export interface Raster {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

function paintColumn(
  image: Raster,
  target: Uint8Array,
  width: number,
  height: number,
  column: number,
  count: number,
) {
  const left = Math.floor((column * width) / count);
  const right = Math.floor(((column + 1) * width) / count);
  const slotWidth = right - left;
  const scale = Math.max(slotWidth / image.width, height / image.height) * 2;
  const sourceX = new Uint32Array(slotWidth);
  for (let x = 0; x < slotWidth; x++)
    sourceX[x] =
      Math.max(
        0,
        Math.min(
          image.width - 1,
          Math.floor(image.width / 2 + (x - slotWidth / 2) / scale),
        ),
      ) * 4;
  for (let y = 0; y < height; y++) {
    const sourceRow =
      Math.max(
        0,
        Math.min(
          image.height - 1,
          Math.floor(image.height / 2 + (y - height / 2) / scale),
        ),
      ) *
      image.width *
      4;
    let destination = (y * width + left) * 4;
    for (let x = 0; x < slotWidth; x++, destination += 4) {
      const source = sourceRow + sourceX[x];
      target[destination] = image.data[source];
      target[destination + 1] = image.data[source + 1];
      target[destination + 2] = image.data[source + 2];
      target[destination + 3] = image.data[source + 3];
    }
  }
}

const CRC_TABLE = new Uint32Array(256).map((_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++)
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function pngChunk(type: string, bytes: Uint8Array) {
  const chunk = new Uint8Array(bytes.length + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, bytes.length);
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(bytes, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < chunk.length - 4; i++)
    crc = CRC_TABLE[(crc ^ chunk[i]) & 255] ^ (crc >>> 8);
  view.setUint32(chunk.length - 4, (crc ^ 0xffffffff) >>> 0);
  return chunk;
}

// Workers' native zlib stream avoids the large synchronous JS deflate heap.
async function encodeEventPng(data: Uint8Array, width: number, height: number) {
  const stride = width * 4;
  const rows = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++)
    rows.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const compressed = new Uint8Array(
    await new Response(
      new Blob([rows]).stream().pipeThrough(new CompressionStream("deflate")),
    ).arrayBuffer(),
  );
  const header = new Uint8Array(13);
  const dimensions = new DataView(header.buffer);
  dimensions.setUint32(0, width);
  dimensions.setUint32(4, height);
  header[8] = 8;
  header[9] = 6; // RGBA, 8-bit, non-interlaced.
  const chunks = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array()),
  ];
  const result = new Uint8Array(
    chunks.reduce((size, chunk) => size + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export async function composeEventImage(
  images: Raster[],
  width = 960,
  height = 540,
): Promise<Uint8Array> {
  if (images.length < 1 || images.length > 3)
    throw new Error("Expected one to three listing images.");
  const data = new Uint8Array(width * height * 4);
  images.forEach((image, column) =>
    paintColumn(image, data, width, height, column, images.length),
  );
  return encodeEventPng(data, width, height);
}

export async function decodeListingImage(buffer: ArrayBuffer): Promise<Raster> {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xd8)
    return jpeg.decode(bytes, {
      useTArray: true,
      maxResolutionInMP: 16,
      maxMemoryUsageInMB: 128,
    });
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const png = decodePng(bytes);
    if (png.depth !== 8 || png.width * png.height > 16_000_000)
      throw new Error("Unsupported PNG size or bit depth.");
    const data = new Uint8Array(png.width * png.height * 4);
    for (let i = 0; i < png.width * png.height; i++) {
      const offset = i * png.channels;
      const gray = png.channels < 3;
      data[i * 4] = png.data[offset];
      data[i * 4 + 1] = png.data[offset + (gray ? 0 : 1)];
      data[i * 4 + 2] = png.data[offset + (gray ? 0 : 2)];
      data[i * 4 + 3] =
        png.channels === 2 || png.channels === 4
          ? png.data[offset + png.channels - 1]
          : 255;
    }
    return { width: png.width, height: png.height, data };
  }
  if (String.fromCharCode(...bytes.slice(8, 12)) === "WEBP")
    return decodeWebp(buffer);
  throw new Error("Unsupported listing image format.");
}

async function renderEventPreview(
  env: any,
  listings: Array<{ id: string; images: string[] }>,
): Promise<string | undefined> {
  const selected = listings.slice(0, 3);
  if (!selected.length) return undefined;
  const width = 960,
    height = 540;
  const canvas = new Uint8Array(width * height * 4);
  const paintedColumns = new Map<string, { left: number; width: number }>();
  for (const [column, listing] of selected.entries()) {
    const left = Math.floor((column * width) / selected.length);
    const right = Math.floor(((column + 1) * width) / selected.length);
    const key = JSON.stringify([listing.id, listing.images]);
    const previous = paintedColumns.get(key);
    if (previous && previous.width === right - left) {
      for (let y = 0; y < height; y++)
        canvas.copyWithin(
          (y * width + left) * 4,
          (y * width + previous.left) * 4,
          (y * width + previous.left + previous.width) * 4,
        );
      continue;
    }
    // Decode, paint, and release one full-resolution source at a time. Retain
    // only the final canvas, including for repeated archived test samples.
    const painted = await (async () => {
      const slots = [
        2,
        0,
        1,
        ...listing.images.map((_, index) => index),
      ].filter((slot, i, all) => all.indexOf(slot) === i);
      let decoded: Raster | undefined;
      for (const slot of slots) {
        if (!listing.images[slot]) continue;
        try {
          // Use existing R2 archives directly; never read legacy KV for composites.
          const archived = await env.MEDIA_BUCKET?.get(
            `media:${listing.id}:${slot}`,
          );
          let buffer: ArrayBuffer;
          if (archived) buffer = await archived.arrayBuffer();
          else {
            const url = new URL(listing.images[slot]);
            if (
              url.protocol !== "https:" ||
              url.hostname !== "dunb17ur4ymx4.cloudfront.net"
            )
              continue;
            const response = await fetch(url, {
              signal: AbortSignal.timeout(8000),
              redirect: "error",
            });
            if (
              !response.ok ||
              Number(response.headers.get("content-length")) > 8_000_000
            )
              continue;
            buffer = await response.arrayBuffer();
          }
          if (buffer.byteLength > 8_000_000) continue;
          decoded = await decodeListingImage(buffer);
          break;
        } catch {
          /* Try the next archived slot. */
        }
      }
      if (!decoded) return false;
      paintColumn(decoded, canvas, width, height, column, selected.length);
      return true;
    })();
    if (!painted) return undefined;
    paintedColumns.set(key, { left, width: right - left });
  }
  const png = await encodeEventPng(canvas, width, height);
  let binary = "";
  for (let i = 0; i < png.length; i += 8192)
    binary += String.fromCharCode(...png.subarray(i, i + 8192));
  return `data:image/png;base64,${btoa(binary)}`;
}

// Bounded isolate-local cache: archived ETags invalidate covers after image replacement.
const coverCaches = new WeakMap<
  object,
  Map<string, { expires: number; image: Promise<string | undefined> }>
>();
export async function generateEventPreview(
  env: any,
  listings: Array<{ id: string; images: string[] }>,
): Promise<string | undefined> {
  const selected = listings.slice(0, 3);
  const bucket = env.MEDIA_BUCKET;
  if (!bucket?.head) return renderEventPreview(env, selected);
  const versions = await Promise.all(
    selected.flatMap((listing) =>
      listing.images.map(async (_, index) => {
        const object = await bucket.head(`media:${listing.id}:${index}`);
        return object?.etag || object?.uploaded?.toISOString() || null;
      }),
    ),
  ).catch(() => null);
  if (!versions) return renderEventPreview(env, selected);
  const key = JSON.stringify(["cover-v2-960x540-center50", selected, versions]);
  let cache = coverCaches.get(bucket);
  if (!cache) {
    cache = new Map();
    coverCaches.set(bucket, cache);
  }
  const now = Date.now();
  for (const [id, entry] of cache) if (entry.expires <= now) cache.delete(id);
  const prior = cache.get(key);
  if (prior) return prior.image;
  while (cache.size >= 4) cache.delete(cache.keys().next().value!);
  const image = renderEventPreview(env, selected);
  cache.set(key, { expires: now + 15 * 60_000, image });
  try {
    const result = await image;
    if (!result) cache.delete(key);
    return result;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}
