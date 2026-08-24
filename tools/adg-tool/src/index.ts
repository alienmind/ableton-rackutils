#!/usr/bin/env node
/**
 * adg-tool: schema investigation, plus a CLI harness for the codec.
 *
 *   adg-tool unpack rack.adg [--raw] > rack.xml
 *   adg-tool diff A.adg B.adg
 *   adg-tool mappings rack.adg
 *   adg-tool move rack.adg <from> <to> out.adg
 *
 * `unpack`/`diff` predate the codec and stay independent of it deliberately
 * (Node's own zlib, a regex strip) - they're what SCHEMA.md itself was built
 * with, and should keep working even if the codec has a bug. `mappings`/`move`
 * are the opposite: a way to exercise @rackutils/adg-codec directly against a
 * real file without needing the site UI, useful for testing `mutate.ts`
 * end to end (parse -> mutate -> write -> load the result in Live).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { JSDOM } from 'jsdom';

// The codec expects a global DOMParser/XMLSerializer, same as the browser
// build provides natively and vitest.config.ts provides via jsdom for tests.
// A plain Node CLI is a third environment that needs to supply the same
// thing - the codec itself has no Node-only branch.
const { window } = new JSDOM();
globalThis.DOMParser = window.DOMParser as unknown as typeof DOMParser;
globalThis.XMLSerializer = window.XMLSerializer as unknown as typeof XMLSerializer;

const { Rack, moveMapping } = await import('@rackutils/adg-codec');

const VOLATILE = ['Id', 'PointeeId', 'LomId', 'LomIdView'];

function unpack(path: string, raw: boolean): string {
  let xml = gunzipSync(readFileSync(path)).toString('utf8');
  if (!raw) {
    // Attribute-level strip. Regex is acceptable here because this is a
    // human-facing inspection tool, not the codec. The codec uses DOM APIs.
    for (const attr of VOLATILE) {
      xml = xml.replace(new RegExp(`\\s${attr}="[^"]*"`, 'g'), '');
    }
  }
  return indent(xml);
}

/** Ableton writes long single lines. One element per line makes diffs usable. */
function indent(xml: string): string {
  const out: string[] = [];
  let depth = 0;
  for (const tok of xml.replace(/></g, '>\n<').split('\n')) {
    const t = tok.trim();
    if (!t) continue;
    if (t.startsWith('</')) depth = Math.max(0, depth - 1);
    out.push('  '.repeat(depth) + t);
    const selfClosing = t.endsWith('/>') || t.startsWith('<?');
    const inlineClose = /^<([\w.:-]+)[^>]*>.*<\/\1>$/.test(t);
    if (t.startsWith('<') && !t.startsWith('</') && !selfClosing && !inlineClose) depth++;
  }
  return out.join('\n');
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'unpack') {
  const raw = args.includes('--raw');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) throw new Error('usage: adg-tool unpack <file.adg> [--raw]');
  process.stdout.write(unpack(file, raw) + '\n');
} else if (cmd === 'diff') {
  const [a, b] = args;
  if (!a || !b) throw new Error('usage: adg-tool diff <A.adg> <B.adg>');
  const [la, lb] = [unpack(a, false).split('\n'), unpack(b, false).split('\n')];
  // Deliberately naive line diff: enough to spot a mapping subtree appearing.
  const setB = new Set(lb);
  const setA = new Set(la);
  for (const l of la) if (!setB.has(l)) console.log(`- ${l}`);
  for (const l of lb) if (!setA.has(l)) console.log(`+ ${l}`);
} else if (cmd === 'mappings') {
  const [file] = args;
  if (!file) throw new Error('usage: adg-tool mappings <file.adg>');
  const rack = Rack.parse(new Uint8Array(readFileSync(file)));
  console.log(`${rack.name} - ${rack.macroCount} visible macros`);
  for (const macro of rack.macros) {
    if (macro.bindings.length === 0) continue;
    const targets = macro.bindings
      .map(({ targetName, rangeMin, rangeMax, inverted }) => `${targetName} [${rangeMin}..${rangeMax}]${inverted ? ' inverted' : ''}`)
      .join(', ');
    console.log(`  Macro ${macro.index + 1} (${macro.name}) -> ${targets}`);
  }
  if (rack.variations.length) {
    console.log(`${rack.variations.length} variation(s): ${rack.variations.map((v) => v.name).join(', ')}`);
  }
} else if (cmd === 'move') {
  const [file, fromStr, toStr, outFile] = args;
  if (!file || !fromStr || !toStr || !outFile) {
    throw new Error('usage: adg-tool move <file.adg> <from-macro-1-based> <to-macro-1-based> <out.adg>');
  }
  const rack = Rack.parse(new Uint8Array(readFileSync(file)));
  const result = moveMapping(rack, Number(fromStr) - 1, Number(toStr) - 1);
  for (const w of result.warnings) console.warn(`warning: ${w}`);
  if (!result.ok) {
    console.error('move failed');
    process.exit(1);
  }
  writeFileSync(outFile, rack.serialize());
  console.log(`wrote ${outFile} - macro ${fromStr} moved to macro ${toStr}`);
} else {
  console.error('usage: adg-tool <unpack|diff|mappings|move> ...');
  process.exit(2);
}
