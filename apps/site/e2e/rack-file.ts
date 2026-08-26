import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDrumFixtureBytes, buildFixtureBytes } from '../../../packages/adg-codec/tests/fixture';

/**
 * The real `.adg` fixtures are gitignored, so they do not exist in CI. These
 * tests use the codec's own synthetic racks instead, written to a temp file so
 * the page can load one through its file input like any other rack.
 */
export function writeRackFile(kind: 'instrument' | 'drum' | 'plugin' | 'plugin-mapped' = 'instrument'): string {
  // The plugin case cannot be synthesized: a Vst3Preset is 77 KB of opaque
  // plugin state and a class id nobody may invent (Constraint 7, SCHEMA.md
  // Q17). The donor is committed, so it is there in CI too.
  const here = dirname(fileURLToPath(import.meta.url));
  const donor = (name: string) => join(here, '..', '..', '..', 'packages', 'adg-codec', 'donors', name);
  if (kind === 'plugin') return donor('BS-VST3.adg');
  if (kind === 'plugin-mapped') return donor('BS-VST3-mapped.adg');
  const dir = mkdtempSync(join(tmpdir(), 'rackutils-e2e-'));
  const path = join(dir, kind === 'drum' ? 'drum.adg' : 'rack.adg');
  writeFileSync(path, kind === 'drum' ? buildDrumFixtureBytes() : buildFixtureBytes({ withVariations: true }));
  return path;
}
