import logoUrl from './assets/logo.jpg';
import { GettingStarted } from './GettingStarted';

/**
 * Everything that explains the tool to someone arriving cold: the logo, the
 * name, and the guide to getting a rack out of Live.
 *
 * It lives in its own module so the Max for Live build can drop it whole. The
 * device window is small, its user installed the thing on purpose, and the
 * logo alone is 2.4MB inside an `.amxd` that ships offline. `vite.config.ts`
 * aliases this module to `Landing.embedded.tsx` when `VITE_EMBED=1`, which is
 * what keeps the assets out of the bundle rather than merely unrendered
 * (doc/PLAN.md 4.7).
 */
export function Landing({ compact }: { compact: boolean }) {
  return (
    <>
      <header>
        <img src={logoUrl} alt="ableton-rackutils" className="logo" />
        <h1>
          ableton-rackutils <span className="badge">v0.2.0 beta</span>
        </h1>
        <p className="tagline">Rearrange the macro knobs on an Ableton rack, in your browser.</p>
      </header>
      <GettingStarted compact={compact} />
    </>
  );
}
