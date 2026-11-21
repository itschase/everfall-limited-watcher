import { decode as decodePng, encode as encodePng } from "fast-png";
import jpeg from "jpeg-js";
import decodeWebp, { init as initWebp } from "@jsquash/webp/decode.js";

export { initWebp };
export interface Raster {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export function composeEventImage(
  images: Raster[],
  width = 960,
  height = 540,
): Uint8Array {
  if (images.length < 1 || images.length > 3)
    throw new Error("Expected one to three listing images.");
  const data = new Uint8Array(width * height * 4);
  images.forEach((image, column) => {
    const left = Math.floor((column * width) / images.length);
    const right = Math.floor(((column + 1) * width) / images.length);
    const slotWidth = right - left;
    // Cover the slot, then zoom into the central 50% of the source.
    const scale = Math.max(slotWidth / image.width, height / image.height) * 2;
    for (let y = 0; y < height; y++)
      for (let x = left; x < right; x++) {
        const sx = Math.max(
          0,
          Math.min(
            image.width - 1,
            Math.floor(image.width / 2 + (x - left - slotWidth / 2) / scale),
          ),
        );
        const sy = Math.max(
          0,
          Math.min(
            image.height - 1,
            Math.floor(image.height / 2 + (y - height / 2) / scale),
          ),
        );
        const source = (sy * image.width + sx) * 4;
        const target = (y * width + x) * 4;
        data.set(image.data.subarray(source, source + 4), target);
      }
  });
  return encodePng({ width, height, data, channels: 4, depth: 8 });
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

export async function generateEventPreview(
  env: any,
  listings: Array<{ id: string; images: string[] }>,
): Promise<string | undefined> {
  const images: Raster[] = [];
  for (const listing of listings.slice(0, 3)) {
    const slots = [2, 0, 1, ...listing.images.map((_, index) => index)].filter(
      (slot, i, all) => all.indexOf(slot) === i,
    );
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
    if (!decoded) return undefined;
    images.push(decoded);
  }
  if (!images.length) return undefined;
  const png = composeEventImage(images);
  let binary = "";
  for (let i = 0; i < png.length; i += 8192)
    binary += String.fromCharCode(...png.subarray(i, i + 8192));
  return `data:image/png;base64,${btoa(binary)}`;
}
