import logoUrl from './assets/logo.jpg';
import { GettingStarted } from './GettingStarted';

/**
 * The masthead: the logo, the name, what it does. Nothing else - the two
 * controls anyone came for sit directly under it, and the explanations are
 * behind the question marks below them (`GettingStarted`).
 *
 * It lives in its own module so the Max for Live build can drop it whole. The
 * device window is small, its user installed the thing on purpose, and the
 * logo alone is 2.4MB inside an `.amxd` that ships offline. `vite.config.ts`
 * aliases this module to `Landing.embedded.tsx` when `VITE_EMBED=1`, which is
 * what keeps the assets out of the bundle rather than merely unrendered
 * (doc/PLAN.md).
 */
export function Landing({ compact }: { compact: boolean }) {
  return (
    <>
      <header className={compact ? 'masthead compact' : 'masthead'}>
        <img src={logoUrl} alt="ableton-rackutils" className="logo" />
        <h1>
          ableton-rackutils <span className="badge">v{__APP_VERSION__} beta</span>
        </h1>
        <p className="tagline">Advanced macro utilities for your Ableton racks.</p>
      </header>
    </>
  );
}

/**
 * The explanations, which sit UNDER the two transfer controls: one line each,
 * with the walkthrough and the device's small print behind a question mark.
 *
 * Exported from this module rather than imported by `App` directly so the
 * device build drops it with everything else here - it is the guide images
 * that must not reach the `.amxd`, and an import in `App` would pull them into
 * the module graph whatever the component renders.
 */
export function LandingGuide({ compact }: { compact: boolean }) {
  return <GettingStarted compact={compact} />;
}
