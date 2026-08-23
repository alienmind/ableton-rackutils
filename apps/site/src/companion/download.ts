/**
 * Fetches the companion device's latest build from GitHub Releases
 * (doc/PLAN.md Phase 4.5). Always render a hardcoded fallback link if this
 * returns null - GitHub's unauthenticated API is rate-limited per IP and will
 * occasionally fail for reasons having nothing to do with the user.
 *
 * Fetched by TAG, not `/releases/latest`: the release is marked prerelease
 * (release-device.yml - it's a rolling build, overwritten on every push to
 * main, not a versioned release), and GitHub's `/releases/latest` endpoint
 * explicitly excludes prereleases and drafts.
 */
const RELEASE_TAG_URL = 'https://api.github.com/repos/alienmind/ableton-rackutils/releases/tags/latest-device';

export interface CompanionRelease {
  url: string;
  builtAt: string;
}

export async function latestCompanion(): Promise<CompanionRelease | null> {
  try {
    const res = await fetch(RELEASE_TAG_URL);
    if (!res.ok) return null;
    const release = await res.json();
    const asset = release.assets?.find((a: { name: string }) => a.name.endsWith('.amxd'));
    return asset ? { url: asset.browser_download_url, builtAt: release.published_at } : null;
  } catch {
    return null; // offline, rate-limited, whatever - fall back to the static link.
  }
}

/** Always resolvable, no API call - the fallback the button links to before the fetch resolves or if it fails. */
export const FALLBACK_RELEASE_URL = 'https://github.com/alienmind/ableton-rackutils/releases/tag/latest-device';
