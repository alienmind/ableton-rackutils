import step1 from './assets/guide/saving-rack-01.png';
import step2 from './assets/guide/saving-rack-02.png';
import step3 from './assets/guide/saving-rack-03.png';
import maxForLive from './assets/guide/max4live.png';
import { useEffect, useState } from 'react';
import { FALLBACK_RELEASE_URL, latestCompanion } from './companion/download';

/**
 * How to get a rack out of Live and into this page.
 *
 * This is the first thing anyone needs and none of it is guessable: the rack
 * has to be saved to disk first (doc/PLAN.md Constraint 1 - mappings live in
 * the file, and Live will not hand them to a plugin), and the saved file lands
 * in the User Library, which is not where anyone looks. The old copy explained
 * what the tool does; a first-time user needs to be told what to do.
 */
export function GettingStarted({ compact }: { compact: boolean }) {
  const [companionUrl, setCompanionUrl] = useState(FALLBACK_RELEASE_URL);

  useEffect(() => {
    let cancelled = false;
    // Renders a working fallback link immediately and upgrades to the direct
    // .amxd once the API answers - this must never block the main flow.
    latestCompanion().then((r) => {
      if (!cancelled && r) setCompanionUrl(r.url);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
            <strong>3. Find the file.</strong> Right-click the saved <code>.adg</code> in Live's browser and
            choose <em>Show in Explorer</em> (<em>Show in Finder</em> on a Mac).
          </div>
          <img src={step3} alt="The Show in Explorer entry in Ableton's browser context menu" />
        </li>
        <li>
          <div className="guide-text">
            <strong>4. Drag it here.</strong> Drop the file from Explorer onto this page. When you are done
            editing, save a copy and drag that back onto the rack in Live.
          </div>
        </li>
      </ol>

      <a className="companion-card" href={companionUrl} target="_blank" rel="noreferrer">
        <img src={maxForLive} alt="Max for Live" />
        <span>Click here for an optional companion device</span>
      </a>
    </section>
  );
}
