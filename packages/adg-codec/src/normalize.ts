/**
 * Ableton regenerates these attributes on every save, so a raw diff of two
 * otherwise-identical racks is unreadable noise.
 *
 * IMPORTANT: volatile is not the same as ignorable. A macro mapping references
 * its target BY id, so these attributes are structurally load-bearing when
 * writing. Stripping them is only valid for comparison and diffing.
 * See mutate.ts for the write-side rules.
 */
export const VOLATILE_ATTRS = ['Id', 'PointeeId', 'LomId', 'LomIdView'] as const;

const VOLATILE = new Set<string>(VOLATILE_ATTRS);

export function normalize(doc: Document): Document {
  const walk = (el: Element): void => {
    for (const attr of Array.from(el.attributes)) {
      if (VOLATILE.has(attr.name)) el.removeAttribute(attr.name);
    }
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(doc.documentElement);
  return doc;
}

/**
 * Highest Id currently in the document. New elements allocate above this.
 * Never reuse an id across different objects; prefer moving existing nodes
 * over constructing new ones wherever the schema allows.
 */
export function maxId(doc: Document): number {
  let max = 0;
  for (const el of Array.from(doc.querySelectorAll('[Id]'))) {
    const n = Number(el.getAttribute('Id'));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max;
}
