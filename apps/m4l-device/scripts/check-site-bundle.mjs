/**
 * The two guards on the embedded site (doc/PLAN.md 4.7). Both fail the build,
 * in CI and locally, because both produce a device that looks installed and
 * does nothing.
 *
 * 1. NO ABSOLUTE ASSET PATHS. Inside `jweb` the page is loaded from a
 *    `file://` URL, so `/ableton-rackutils/assets/index.js` resolves against
 *    the FILESYSTEM ROOT and 404s into a blank window. This is the top
 *    device-side failure mode and it is invisible in a browser, where the same
 *    path works.
 * 2. NO SERVICE WORKER. Bundling already solves offline; a worker in the
 *    device only adds a layer that can serve a stale UI after a device update
 *    (4.5). `VITE_EMBED=1` skips the PWA plugin - this is what keeps it
 *    skipped.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/**
 * @param {string} dir the built site
 * @returns {string[]} one line per problem, empty when the bundle is fit to ship
 */
export function checkSiteBundle(dir) {
  const problems = [];
  const files = walk(dir);

  const sw = files.filter((f) => /(^|[\\/])(sw|registerSW|workbox-[^\\/]*)\.js$/.test(f));
  for (const f of sw) problems.push(`service worker in the bundle: ${path.relative(dir, f)}`);

  for (const file of files.filter((f) => /\.(html|css|js|webmanifest)$/.test(f))) {
    const text = readFileSync(file, "utf8");
    // src="/x", href='/x', url(/x): an absolute path, as written by a build
    // with a base other than './'. Protocol-relative and data: URLs are not
    // this problem, and neither is a bare "/" inside a string of code, so the
    // match is anchored on the attribute or the url() that loads something.
    const absolute = [...text.matchAll(/(?:src|href)=["']\/(?!\/)[^"']*|url\(\s*["']?\/(?!\/)[^)"']*/g)].map((m) => m[0]);
    for (const hit of new Set(absolute)) problems.push(`absolute asset path in ${path.relative(dir, file)}: ${hit.slice(0, 80)}`);
  }

  return problems;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const dir = process.argv[2] ?? path.join(process.cwd(), "site");
  const problems = checkSiteBundle(dir);
  for (const p of problems) console.error(`m4l-jweb: ${p}`);
  if (problems.length) {
    console.error(`\n${problems.length} problem(s) in ${dir} - see scripts/check-site-bundle.mjs for why each one is fatal`);
    process.exit(1);
  }
  console.log(`m4l-jweb: ${dir} is clean - relative paths, no service worker`);
}
