import { useEffect, useState } from 'react';
import { FALLBACK_RELEASE_URL, latestCompanion, type CompanionRelease } from './download';

/**
 * "Download companion device", per doc/PLAN.md 4.4/4.5. Optional and
 * secondary - this must never block or clutter the main drag-and-drop flow,
 * so it renders a working link immediately (the fallback) and swaps to the
 * direct .amxd asset link once/if the API call resolves.
 */
export function CompanionDownload() {
  const [release, setRelease] = useState<CompanionRelease | null>(null);

  useEffect(() => {
    let cancelled = false;
    latestCompanion().then((r) => {
      if (!cancelled) setRelease(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <p className="companion-download">
      Optional: <a href={release?.url ?? FALLBACK_RELEASE_URL}>download the companion Max for Live device</a>
      {' - '}
      an early scaffold (see <code>apps/m4l-device/README.md</code>), audio effect, no editor UI wired in yet.
    </p>
  );
}
