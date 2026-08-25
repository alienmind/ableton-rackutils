import { useEffect, useState } from 'react';
import { FALLBACK_RELEASE_URL, latestCompanion, type CompanionRelease } from './companion/download';
import step1 from './assets/guide/saving-rack-01.png';
import step2 from './assets/guide/saving-rack-02.png';
import step3 from './assets/guide/saving-rack-03.png';
import maxForLive from './assets/guide/max4live.png';

/**
 * How to get a rack out of Live and into this page.
 *
 * This is the first thing anyone needs and none of it is guessable: the rack
 * has to be saved to disk first (doc/PLAN.md Constraint 1 - mappings live in
 * the file, and Live will not hand them to a plugin), and the saved file lands
 * in the User Library, which is not where anyone looks. The old copy explained
 * what the tool does; a first-time user needs to be told what to do.
 */
/**
 * The device: the same editor, bundled, so it runs inside Live with no browser
 * and no network (doc/PLAN.md 4.7). It adds no editing capability, so the card
 * says what it adds and what it costs - an .amxd is executable content and
 * installing one is a real trust decision, which is why the source and the
 * build that produced it are linked from here.
 *
 * The link points at the newest VERSIONED release, resolved live, and falls
 * back to the releases page: GitHub's unauthenticated API is rate-limited per
 * IP and fails for reasons that have nothing to do with the user.
 */
function CompanionDownload() {
  const [release, setRelease] = useState<CompanionRelease | null>(null);
  useEffect(() => {
    let live = true;
    void latestCompanion().then((r) => live && setRelease(r));
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="companion">
      <a className="companion-card" href={release?.url ?? FALLBACK_RELEASE_URL} target="_blank" rel="noreferrer">
        <img src={maxForLive} alt="Max for Live" />
        <span>Max for Live Companion Device</span>
        {release && <span className="version-badge">{release.version}</span>}
      </a>
      <p className="companion-note">
        The same editor, offline, inside Live - needs Live 12 and Max for Live. Unpack the zip whole: the
        device reads the folder next to it, and the installer scripts put both in your User Library. On a
        Mac, macOS quarantines anything downloaded, and the installer clears that flag. Built by{' '}
        <a href="https://github.com/alienmind/ableton-rackutils/blob/main/.github/workflows/release-device.yml">
          this workflow
        </a>{' '}
        from <a href="https://github.com/alienmind/ableton-rackutils">this source</a>.
      </p>
    </div>
  );
}

export function GettingStarted({ compact }: { compact: boolean }) {
  if (compact) return null;

  return (
    <section className="getting-started">
      <h2>Getting a rack in here</h2>
      <p className="lead">
        Macro mappings live inside the saved rack file, so the first step happens in Live: save the rack to
        disk, then drag that file onto this page. Nothing is uploaded - the file is read, edited and rebuilt
        in this tab.
      </p>

      <ol className="guide-steps">
        <li>
          <div className="guide-text">
            <strong>1. Save the rack.</strong> Click the disk icon in the rack's title bar.
          </div>
          <img src={step1} alt="The save icon in an Ableton rack's title bar" />
        </li>
        <li>
          <div className="guide-text">
            <strong>2. Let it collect the assets.</strong> Accept saving the samples and presets into the
            library when Live asks.
          </div>
          <img src={step2} alt="Ableton asking to save the rack's assets to the library" />
        </li>
        <li>
          <div className="guide-text">
            <strong>3. Find the file and drag it here.</strong> Right-click the saved <code>.adg</code> in
            Live's browser, choose <em>Show in Explorer</em> (<em>Show in Finder</em> on a Mac), and drop the
            file onto this page. When you are done editing, save a copy and drag that back onto the rack in
            Live.
          </div>
          <img src={step3} alt="The Show in Explorer entry in Ableton's browser context menu" />
        </li>
      </ol>

      <CompanionDownload />
    </section>
  );
}
