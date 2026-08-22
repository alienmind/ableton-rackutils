import { describe, expect, test } from 'vitest';
import { compress, decompress, isGzip } from '../src/gzip';

// Only gzip.ts is implemented so far. parse.ts and mutate.ts wait on
// SCHEMA.md, see packages/adg-codec/SCHEMA.md.

describe('gzip', () => {
  test('compress then decompress returns the original XML', () => {
    const xml = '<Ableton><GroupDevicePreset /></Ableton>';
    expect(decompress(compress(xml))).toBe(xml);
  });

  test('isGzip detects the gzip magic bytes', () => {
    expect(isGzip(compress('<x/>'))).toBe(true);
    expect(isGzip(new TextEncoder().encode('<x/>'))).toBe(false);
  });

  test('isGzip rejects buffers shorter than the magic bytes', () => {
    expect(isGzip(new Uint8Array([0x1f]))).toBe(false);
    expect(isGzip(new Uint8Array())).toBe(false);
  });
});
