/**
 * The VST3 class id: how an `.adg` stores it, and how a plugin binary embeds
 * it (SCHEMA.md Q17, Q18).
 *
 * No DOM and no rack schema here. The scan that turns an id back into a
 * plugin name reads the user's own `.vst3` files, which is a browser API the
 * codec has no business owning; what it does own is the byte forms to look
 * for.
 */

/** 16 bytes, so 32 hex characters. */
const UID_HEX = 32;

/**
 * `Uid/Fields.0-3` are four 32-bit ints, big-endian, concatenated (SCHEMA.md
 * Q18). Ableton writes them as signed decimals, so a field with the high bit
 * set arrives negative.
 */
export function uidFromFields(fields: readonly number[]): string {
  return fields.map((f) => (f >>> 0).toString(16).padStart(8, '0')).join('');
}

export function uidToBytes(uid: string): Uint8Array {
  if (uid.length !== UID_HEX) throw new Error(`not a VST3 class id: ${uid}`);
  return Uint8Array.from({ length: 16 }, (_, i) => Number.parseInt(uid.slice(i * 2, i * 2 + 2), 16));
}

/**
 * The same 16 bytes in COM order: reverse the first four, then the next two,
 * then the next two, and keep the last eight as they are - the usual GUID
 * reshuffle.
 *
 * Windows embeds this form and NOT the plain one (SCHEMA.md Q18, confirmed by
 * byte search against MiniBrute V.vst3), while the VST3 SDK is not COM-ordered
 * on every platform. A scan has to look for both.
 */
export function toComOrder(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes);
  out.set(bytes.subarray(0, 4).slice().reverse(), 0);
  out.set(bytes.subarray(4, 6).slice().reverse(), 4);
  out.set(bytes.subarray(6, 8).slice().reverse(), 6);
  return out;
}

/**
 * Some vendors build a class id out of ASCII - the Arturia id in
 * `donors/BS-VST3.adg` reads `ArtuAVISMBRTProc` (SCHEMA.md Q17). Worth showing
 * beside an unresolved id, never worth relying on: it is a vendor habit, not
 * part of the format.
 */
export function uidAscii(uid: string): string | null {
  const bytes = uidToBytes(uid);
  let text = '';
  for (const b of bytes) {
    if (b < 0x20 || b > 0x7e) return null;
    text += String.fromCharCode(b);
  }
  return text;
}
