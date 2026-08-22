#!/usr/bin/env node
/**
 * adg-inspect: Phase 1 tooling. Unpack and diff .adg files to establish the
 * XML schema empirically before any codec code is written.
 *
 *   adg-inspect unpack rack.adg [--raw] > rack.xml
 *   adg-inspect diff A.adg B.adg
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

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
  if (!file) throw new Error('usage: adg-inspect unpack <file.adg> [--raw]');
  process.stdout.write(unpack(file, raw) + '\n');
} else if (cmd === 'diff') {
  const [a, b] = args;
  if (!a || !b) throw new Error('usage: adg-inspect diff <A.adg> <B.adg>');
  const [la, lb] = [unpack(a, false).split('\n'), unpack(b, false).split('\n')];
  // Deliberately naive line diff: enough to spot a mapping subtree appearing.
  const setB = new Set(lb);
  const setA = new Set(la);
  for (const l of la) if (!setB.has(l)) console.log(`- ${l}`);
  for (const l of lb) if (!setA.has(l)) console.log(`+ ${l}`);
} else {
  console.error('usage: adg-inspect <unpack|diff> ...');
  process.exit(2);
}
