/**
 * The byte search behind the plugin dependency view (doc/PLAN.md 4.1,
 * SCHEMA.md Q18). The picker itself is not testable here - it needs a real
 * Chromium and a real folder - but what it does with the bytes is.
 */
import { describe, expect, test } from 'vitest';
import { toComOrder, uidToBytes } from '@rackutils/adg-codec';
import { containsBytes, searchStreamForUids } from '../src/pluginScan';

const ARTURIA = '41727475415649534d42525450726f63';
const patterns = [{ uid: ARTURIA, forms: [uidToBytes(ARTURIA), toComOrder(uidToBytes(ARTURIA))] }];

/** `size` bytes of filler with `needle` written at `offset`, standing in for a plugin binary. */
function binary(size: number, needle: Uint8Array, offset: number): Uint8Array {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = i % 251;
  bytes.set(needle, offset);
  return bytes;
}

/** The bytes, handed over in `chunk`-sized pieces - the part of a file read the search has to survive. */
function streamOf(bytes: Uint8Array, chunk: number): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(offset, offset + chunk));
      offset += chunk;
    },
  });
}

describe('containsBytes', () => {
  test('finds a needle at the very end', () => {
    expect(containsBytes(Uint8Array.from([9, 9, 1, 2, 3]), Uint8Array.from([1, 2, 3]))).toBe(true);
  });

  test('a partial match is not a match', () => {
    expect(containsBytes(Uint8Array.from([1, 2, 9, 1, 2]), Uint8Array.from([1, 2, 3]))).toBe(false);
  });
});

describe('searchStreamForUids', () => {
  test('finds the COM-ordered id, which is the form Windows embeds', async () => {
    const bytes = binary(4096, toComOrder(uidToBytes(ARTURIA)), 1000);
    expect(await searchStreamForUids(streamOf(bytes, 1024), patterns)).toEqual([ARTURIA]);
  });

  test('finds the plain order too, since the SDK is not COM-ordered everywhere', async () => {
    const bytes = binary(4096, uidToBytes(ARTURIA), 40);
    expect(await searchStreamForUids(streamOf(bytes, 1024), patterns)).toEqual([ARTURIA]);
  });

  test('finds an id that straddles a chunk boundary', async () => {
    // The one miss a chunked search can produce on its own, and it would read
    // exactly like the plugin not being installed.
    const bytes = binary(4096, uidToBytes(ARTURIA), 1024 - 8);
    expect(await searchStreamForUids(streamOf(bytes, 1024), patterns)).toEqual([ARTURIA]);
  });

  test('finds one that starts on the last byte of a chunk', async () => {
    const bytes = binary(4096, uidToBytes(ARTURIA), 2047);
    expect(await searchStreamForUids(streamOf(bytes, 1024), patterns)).toEqual([ARTURIA]);
  });

  test('a file without it reports nothing, which is the answer the view wants', async () => {
    expect(await searchStreamForUids(streamOf(binary(4096, new Uint8Array(0), 0), 1024), patterns)).toEqual([]);
  });
});
