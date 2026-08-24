import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDrumFixtureBytes, buildFixtureBytes } from '../../../packages/adg-codec/tests/fixture';

/**
 * The real `.adg` fixtures are gitignored, so they do not exist in CI. These
 * tests use the codec's own synthetic racks instead, written to a temp file so
 * the page can load one through its file input like any other rack.
 */
export function writeRackFile(kind: 'instrument' | 'drum' = 'instrument'): string {
  const dir = mkdtempSync(join(tmpdir(), 'rackutils-e2e-'));
  const path = join(dir, kind === 'drum' ? 'drum.adg' : 'rack.adg');
  writeFileSync(path, kind === 'drum' ? buildDrumFixtureBytes() : buildFixtureBytes({ withVariations: true }));
  return path;
}
