import { useEffect, useState } from 'react';
import { FALLBACK_RELEASE_URL, latestCompanion, type CompanionRelease } from './companion/download';
import { HelpButton, Modal } from './Modal';
import step1 from './assets/guide/saving-rack-01.png';
import step2 from './assets/guide/saving-rack-02.png';
import step3 from './assets/guide/saving-rack-03.png';
import maxForLive from './assets/guide/max4live.png';

/**
 * How to get a rack out of Live, and the companion device - both one line and
 * a `?`.
 *
 * The walkthrough is not guessable and it is not optional: a rack has to be
 * saved to disk before this tool can see it (Constraint 1), and the file lands
 * in the User Library, where nobody looks. It is also three screenshots of
 * Live, and it used to sit between the title and the two controls anyone came
 * for. So it stays, in a panel, behind a question mark: there for the first
 * visit, out of the way for the twentieth.
 */
export function GettingStarted({ compact }: { compact: boolean }) {
  const [showing, setShowing] = useState<'rack' | 'device' | null>(null);
  if (compact) return null;

  return (
    <section className="getting-started">
      <p className="lead">
        Save the rack in Live first, then drop the <code>.adg</code> above. Nothing is uploaded.
        <HelpButton label="How do I get a rack out of Live?" onClick={() => setShowing('rack')} />
      </p>

      <p className="lead">
        There is a Max for Live version that runs this inside Live, offline.
        <CompanionLink />
        <HelpButton label="What is the companion device?" onClick={() => setShowing('device')} />
      </p>

      {showing === 'rack' && (
        <Modal title="Getting a rack in here" onClose={() => setShowing(null)}>
          <p>
            Macro mappings live inside the saved rack file, so the first step happens in Live: save the rack
            to disk, then drag that file onto this page. Nothing is uploaded - the file is read, edited and
            rebuilt in this tab.
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
                Live's browser, choose <em>Show in Explorer</em> (<em>Show in Finder</em> on a Mac), and drop
                the file onto this page. When you are done editing, export it and drag that file back onto the
                rack in Live.
              </div>
              <img src={step3} alt="The Show in Explorer entry in Ableton's browser context menu" />
            </li>
          </ol>
        </Modal>
      )}

      {showing === 'device' && (
        <Modal title="The Max for Live device" onClose={() => setShowing(null)}>
          <p>
            The same editor, offline, inside Live. It adds no editing capability - what it adds is reach: no
            browser, no network. Needs Live 12 and Max for Live.
          </p>
          <p>
            Unpack the zip whole. The device reads the folder that ships next to it and opens an empty window
            without it; the installer scripts put both into your User Library. On a Mac, macOS quarantines
            anything downloaded, and the installer clears that flag.
          </p>
          <p>
            An <code>.amxd</code> is executable content and installing one is a real trust decision, so:{' '}
            <a href="https://github.com/alienmind/ableton-rackutils/blob/main/.github/workflows/release-device.yml">
              the workflow that builds it
            </a>
            , and <a href="https://github.com/alienmind/ableton-rackutils">the source it is built from</a>.
          </p>
        </Modal>
      )}
    </section>
  );
}

/**
 * The download itself, resolved live: the newest VERSIONED release carrying a
 * device asset, falling back to the releases page. GitHub's unauthenticated
 * API is rate-limited per IP and fails for reasons that have nothing to do
 * with the user (doc/PLAN.md D5).
 */
function CompanionLink() {
  const [release, setRelease] = useState<CompanionRelease | null>(null);
  useEffect(() => {
    let live = true;
    void latestCompanion().then((r) => live && setRelease(r));
    return () => {
      live = false;
    };
  }, []);

  return (
    <a className="companion-card" href={release?.url ?? FALLBACK_RELEASE_URL} target="_blank" rel="noreferrer">
      <img src={maxForLive} alt="" />
      <span>Download</span>
      {release && <span className="version-badge">{release.version}</span>}
    </a>
  );
}
