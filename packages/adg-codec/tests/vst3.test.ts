/**
 * The class id forms a plugin scan looks for (SCHEMA.md Q17, Q18). Every
 * expectation here traces to `donors/BS-VST3.adg` and to the byte search that
 * found that id inside `MiniBrute V.vst3`.
 */
import { describe, expect, test } from 'vitest';
import { toComOrder, uidAscii, uidFromFields, uidToBytes } from '../src/vst3';

const ARTURIA = '41727475415649534d42525450726f63';

describe('uidFromFields', () => {
  test('concatenates the four fields big-endian', () => {
    expect(uidFromFields([1098019957, 1096173907, 1296192084, 1349676899])).toBe(ARTURIA);
  });

  test('a field with the high bit set arrives as a negative decimal', () => {
    // Ableton writes signed ints, so half the id space reads negative in the
    // file and still has to come out as the same 32 hex characters.
    expect(uidFromFields([-1, 0, 0, 1])).toBe('ffffffff0000000000000000' + '00000001');
  });
});

describe('uidToBytes', () => {
  test('16 bytes, in file order', () => {
    expect(Array.from(uidToBytes(ARTURIA).subarray(0, 4))).toEqual([0x41, 0x72, 0x74, 0x75]);
  });

  test('refuses anything that is not a class id', () => {
    expect(() => uidToBytes('41727475')).toThrow(/not a VST3 class id/);
  });
});

describe('toComOrder', () => {
  test('reverses 4, then 2, then 2, and keeps the last eight', () => {
    const bytes = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(Array.from(toComOrder(bytes))).toEqual([4, 3, 2, 1, 6, 5, 8, 7, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  test('leaves its input alone', () => {
    const bytes = uidToBytes(ARTURIA);
    toComOrder(bytes);
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x41, 0x72, 0x74, 0x75]);
  });
});

describe('uidAscii', () => {
  test('the Arturia id is printable, which is a vendor habit and not a rule', () => {
    expect(uidAscii(ARTURIA)).toBe('ArtuAVISMBRTProc');
  });

  test('an id with a non-printable byte has no ASCII reading', () => {
    expect(uidAscii('00' + ARTURIA.slice(2))).toBeNull();
  });
});
