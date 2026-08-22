import { gzip, ungzip } from 'pako';

/**
 * An .adg file is a single gzipped XML document. Nothing more exotic.
 *
 * pako rather than the native CompressionStream: synchronous, behaves
 * identically in Node and the browser, and avoids depending on which Chromium
 * build jweb embeds for the device bundle.
 */

export function decompress(bytes: Uint8Array): string {
  return new TextDecoder().decode(ungzip(bytes));
}

export function compress(xml: string): Uint8Array {
  return gzip(new TextEncoder().encode(xml));
}

/**
 * Byte-level comparison of two .adg files is always false, even for a correct
 * round trip: the gzip header embeds an MTIME field and compression levels
 * differ between implementations. Compare decompressed, normalized XML instead
 * (see normalize.ts).
 */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}
