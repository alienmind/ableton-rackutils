/**
 * Generic XML DOM helpers. No knowledge of rack schema here, only of the
 * `<Tag Value="x" />` and `<Tag>...</Tag>` shapes Ableton's serializer uses
 * throughout the format.
 *
 * Relies on a global DOMParser/XMLSerializer (browser-native, or jsdom in
 * tests, see vitest.config.ts). No Node-only code path: same functions run
 * in the browser build and under vitest.
 */

export function parseXmlDoc(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const error = doc.querySelector('parsererror');
  if (error) throw new Error(`malformed XML: ${error.textContent}`);
  return doc;
}

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

/**
 * Every `.adg` Ableton writes starts with an XML declaration, and Live
 * silently refuses to load a file without one - confirmed by hand on a real
 * rack, drag-and-drop onto a track rejected with no message.
 *
 * `XMLSerializer.serializeToString()` is NOT consistent about emitting it:
 * jsdom omits it, Chrome includes it (SCHEMA.md Q12). An earlier version of
 * this function prepended one unconditionally, which was right under the test
 * suite and produced TWO in a browser. Not a cosmetic difference: the result
 * fails to reparse ("XML declaration allowed only at the start of the
 * document"), so `Rack.clone()` threw on every mutation in the real app while
 * every test passed, and a saved file would have been rejected by Live.
 *
 * So: emit exactly one, wherever this runs.
 */
export function serializeXmlDoc(doc: Document): string {
  const xml = new XMLSerializer().serializeToString(doc);
  if (!xml.startsWith('<?xml')) return `${XML_DECLARATION}\n${xml}`;
  const declEnd = xml.indexOf('?>') + 2;
  return `${xml.slice(0, declEnd)}\n${xml.slice(declEnd).replace(/^\n/, '')}`;
}

/** Direct element children only, skipping text/comment nodes. */
export function elementChildren(el: Element): Element[] {
  return Array.from(el.children);
}

/** First direct child with this exact tag name, or null. Case-sensitive, no CSS-selector escaping needed - safe for tag names containing dots (`MacroControls.0`). */
export function child(el: Element | null | undefined, tag: string): Element | null {
  if (!el) return null;
  for (const c of el.children) {
    if (c.tagName === tag) return c;
  }
  return null;
}

/** The `Value` attribute of a direct `<tag Value="..." />` child, or null if the child is absent. */
export function childValue(el: Element | null | undefined, tag: string): string | null {
  return child(el, tag)?.getAttribute('Value') ?? null;
}

/** Set (creating if absent) a direct `<tag Value="..." />` child's value. */
export function setChildValue(el: Element, tag: string, value: string | number | boolean): void {
  let target = child(el, tag);
  if (!target) {
    target = el.ownerDocument.createElement(tag);
    el.appendChild(target);
  }
  target.setAttribute('Value', String(value));
}

/** Build a standalone `<tag Value="..." />` element, not yet attached anywhere. */
export function createValueEl(doc: Document, tag: string, value: string | number | boolean): Element {
  const el = doc.createElement(tag);
  el.setAttribute('Value', String(value));
  return el;
}

/**
 * Insert `el` as a direct child of `container`, right after its `LomId`
 * child if one exists (matches Ableton's own element order: KeyMidi sits
 * between LomId and Manual - SCHEMA.md Q1). Falls back to prepending.
 */
export function insertAfterLomId(container: Element, el: Element): void {
  const lomId = child(container, 'LomId');
  container.insertBefore(el, lomId ? lomId.nextSibling : container.firstChild);
}

/**
 * Index-chain path from `root` down to `target`, e.g. "0/2/1" - the child
 * index at each level. Stable across `Rack.clone()` (a straight deep copy
 * preserves child order) as long as nothing reorders siblings, which no
 * mutation in this codec does. Used so a `ParamRef` captured from one Rack
 * snapshot can be re-resolved against a later clone.
 */
export function pathOf(root: Element, target: Element): string {
  const chain: number[] = [];
  let node: Element | null = target;
  while (node && node !== root) {
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    chain.unshift(Array.prototype.indexOf.call(parent.children, node));
    node = parent;
  }
  return chain.join('/');
}

export function resolvePath(root: Element, path: string): Element | null {
  if (!path) return root;
  let node: Element = root;
  for (const part of path.split('/')) {
    const next = node.children[Number(part)];
    if (!next) return null;
    node = next;
  }
  return node;
}
