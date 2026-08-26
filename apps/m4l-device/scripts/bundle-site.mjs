/**
 * bundle-site.mjs - build `apps/site` for the device and put it where the
 * device's window can find it (doc/PLAN.md 4.7).
 *
 * The device adds no editing capability. It is the same web app, bundled, so
 * it is reachable inside Live with no browser and no network - authoring racks
 * offline is the whole point. Nothing in `packages/editor-ui` knows the device
 * exists.
 *
 * `VITE_BASE=./` makes every asset path relative, which is what `jweb` needs
 * (see check-site-bundle.mjs), and `VITE_EMBED=1` drops the landing chrome and
 * the service worker at BUILD time, keeping the logo and guide images out of
 * the module graph rather than merely unrendered.
 *
 * The output goes to `site/`, which `surface.ts` declares as the window's
 * content and `m4l-jweb build` copies out as the `-site` sidecar folder beside
 * the .amxd.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkSiteBundle } from "./check-site-bundle.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const device = path.resolve(here, "..");
const repo = path.resolve(device, "..", "..");
const built = path.join(repo, "apps", "site", "dist");
const target = path.join(device, "site");

// Run pnpm's own script rather than the `pnpm` command: on Windows that
// command is a .cmd, which Node refuses to spawn without a shell, and a shell
// would put the arguments through a second round of parsing. `npm_execpath` is
// set by pnpm itself when it runs a script, and is the JS entry point.
const runner = process.env.npm_execpath;
const [command, prefix] = runner && /\.(c?js)$/.test(runner) ? [process.execPath, [runner]] : ["pnpm", []];
console.log("m4l-jweb: building apps/site for the device (VITE_BASE=./ VITE_EMBED=1)");
execFileSync(command, [...prefix, "--filter", "@rackutils/site", "build"], {
  stdio: "inherit",
  cwd: repo,
  env: { ...process.env, VITE_BASE: "./", VITE_EMBED: "1" },
  // Only when there is no runner to fall back on, which is a bare `node
  // scripts/bundle-site.mjs` outside pnpm.
  shell: prefix.length === 0 && process.platform === "win32",
});

if (!existsSync(path.join(built, "index.html"))) {
  throw new Error(`the site build produced no index.html at ${built}`);
}

rmSync(target, { recursive: true, force: true });
cpSync(built, target, { recursive: true });

const problems = checkSiteBundle(target);
for (const p of problems) console.error(`m4l-jweb: ${p}`);
if (problems.length) {
  throw new Error(`${problems.length} problem(s) in the embedded site - the device would open a blank window`);
}

console.log(`m4l-jweb: apps/site/dist -> ${path.relative(repo, target)}`);
