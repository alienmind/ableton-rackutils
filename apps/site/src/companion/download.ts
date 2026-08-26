/**
 * Finds the companion device to offer for download (doc/DEVELOPERS.md).
 *
 * It is the newest VERSIONED release carrying a device asset, not the rolling
 * `latest-device` build. Three reasons that is the right one now that real
 * tags exist: a user reporting a bug can say which device they have, the
 * device and the site that documents it move together instead of the device
 * changing under a fixed link, and a version is a thing a person can talk
 * about.
 *
 * The list endpoint rather than `/releases/latest`: the rolling build is a
 * prerelease and would be excluded, but so would a real release be if it were
 * ever marked one, and the tag list has to be filtered here anyway.
 *
 * Always render the hardcoded fallback if this returns null. GitHub's
 * unauthenticated API is rate-limited per IP and will occasionally fail for
 * reasons having nothing to do with the user.
 */
const RELEASES_URL = 'https://api.github.com/repos/alienmind/ableton-rackutils/releases?per_page=20';

/** `v0.3.0`, and not `latest-device` or anything else the repo tags. */
const VERSION_TAG = /^v\d+\.\d+\.\d+$/;

export interface CompanionRelease {
  url: string;
  /** The tag, shown next to the button so the download says what it is. */
  version: string;
  publishedAt: string;
}

export async function latestCompanion(): Promise<CompanionRelease | null> {
  try {
    const res = await fetch(RELEASES_URL);
    if (!res.ok) return null;
    const releases = await res.json();
    if (!Array.isArray(releases)) return null;

    // Newest first is what the API returns, so the first match wins.
    for (const release of releases) {
      if (release.draft || !VERSION_TAG.test(release.tag_name ?? '')) continue;
      const asset = deviceAsset(release.assets);
      if (asset) return { url: asset.browser_download_url, version: release.tag_name, publishedAt: release.published_at };
    }
    return null;
  } catch {
    return null; // offline, rate-limited, whatever - fall back to the static link.
  }
}

/**
 * The zip, not the bare `.amxd`. The device reads the `rack-editor-site`
 * folder next to it (4.7) and opens an empty window without it, so the zip is
 * the only download that works on its own.
 */
function deviceAsset(assets: unknown): { browser_download_url: string } | null {
  if (!Array.isArray(assets)) return null;
  return assets.find((a: { name?: string }) => a.name?.endsWith('.zip')) ?? null;
}

/** Always resolvable, no API call - what the button links to before the fetch resolves or if it fails. */
export const FALLBACK_RELEASE_URL = 'https://github.com/alienmind/ableton-rackutils/releases';
