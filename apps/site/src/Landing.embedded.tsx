/**
 * The Max for Live stand-in for `Landing.tsx`, wired up by `vite.config.ts`
 * when `VITE_EMBED=1`. Imports nothing, so the logo and the guide images stay
 * out of the `.amxd` (doc/PLAN.md).
 */
export function Landing(_props: { compact: boolean }) {
  return null;
}

export function LandingGuide(_props: { compact: boolean }) {
  return null;
}
