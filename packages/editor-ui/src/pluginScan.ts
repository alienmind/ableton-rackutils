import { toComOrder, uidToBytes } from '@rackutils/adg-codec';

/**
 * Turning a VST3 class id back into a plugin name, in the browser
 * (doc/PLAN.md 4.1, SCHEMA.md Q18).
 *
 * A `.adg` names no plugin: it stores a class id and Live resolves that
 * against what is installed. So does this, the only way a web page can - the
 * user points at their VST3 folder once, each `.vst3` is streamed and searched
 * for the id's 16 bytes, and the FILENAME is the answer.
 *
 * Both byte orders are searched. Windows embeds the COM form and not the plain
 * one, and the SDK is not COM-ordered on every platform (Q18).
 *
 * `moduleinfo.json` is the documented route and is not usable as the primary
 * one: it is opt-in for vendors and there are zero of them on the maintainer's
 * machine, where every `.vst3` is a bare DLL.
 *
 * A MISS is an answer, not a failure: a class id no local plugin contains is a
 * rack this machine cannot fully load, which is the question the dependency
 * view exists to ask.
 */

/** Minimal File System Access surface. Chromium-only today, so everything here is feature-detected. */
interface DirectoryHandle {
  name: string;
  values(): AsyncIterableIterator<DirectoryHandle | FileHandle>;
  kind: 'directory' | 'file';
}
interface FileHandle {
  name: string;
  kind: 'directory' | 'file';
  getFile(): Promise<File>;
}
type PickerWindow = Window & { showDirectoryPicker?: (options?: { id?: string }) => Promise<DirectoryHandle> };

export function canScanPlugins(): boolean {
  return typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function';
}

/**
 * The resolved names, `uid -> plugin filename`.
 *
 * `localStorage` rather than IndexedDB: the table is a few dozen short
 * strings, it is the same per-browser, per-origin deal the template library
 * already lives with (`templates.ts`), and a scan can always be run again.
 */
const CACHE_KEY = 'rackutils.pluginNames.v1';

export function loadPluginNames(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    // A corrupt or blocked store is not worth an error in the UI: the scan is
    // repeatable and the cache only saves time.
    return {};
  }
}

export function savePluginNames(names: Record<string, string>): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(names));
  } catch {
    /* private mode, quota - the names stay for this session and no longer */
  }
}

export interface ScanProgress {
  /** Files searched so far. */
  searched: number;
  /** Name of the file being searched, for a UI that would otherwise show nothing for a minute. */
  current: string;
  /** Ids resolved so far in this scan. */
  found: number;
}

export interface ScanResult {
  names: Record<string, string>;
  searched: number;
}

/**
 * Ask for a folder and search it. Returns the ids it resolved, which is a
 * SUBSET of `uids`: whatever is missing is missing from this machine.
 *
 * Returns null when the user cancels the picker, which is not an error.
 */
export async function scanForPlugins(
  uids: readonly string[],
  onProgress?: (progress: ScanProgress) => void,
): Promise<ScanResult | null> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error('this browser cannot open a folder - Chromium only, for now');

  let root: DirectoryHandle;
  try {
    root = await picker({ id: 'vst3' });
  } catch {
    return null; // the user closed the picker
  }

  const patterns = uids.map((uid) => {
    const plain = uidToBytes(uid);
    return { uid, forms: [plain, toComOrder(plain)] };
  });

  const names: Record<string, string> = {};
  let searched = 0;
  for await (const file of vstFiles(root)) {
    onProgress?.({ searched, current: file.label, found: Object.keys(names).length });
    const remaining = patterns.filter((p) => !(p.uid in names));
    if (remaining.length === 0) break;
    const bytes = (await file.handle.getFile()).stream();
    for (const uid of await searchStreamForUids(bytes, remaining)) {
      names[uid] = file.label;
    }
    searched++;
  }
  onProgress?.({ searched, current: '', found: Object.keys(names).length });
  return { names, searched };
}

interface Candidate {
  handle: FileHandle;
  /** What to report as the plugin's name: the `.vst3` file or bundle, extension dropped. */
  label: string;
}

/**
 * Every file worth searching under `dir`.
 *
 * A `.vst3` is a bare DLL on Windows and a bundle DIRECTORY on macOS, so both
 * shapes have to reach here: a file whose own name ends in `.vst3`, or any
 * file inside a directory whose name does. `bundle` carries that name down so
 * the answer is the plugin's name either way rather than `MiniBrute V.dll`.
 */
async function* vstFiles(dir: DirectoryHandle, bundle?: string): AsyncGenerator<Candidate> {
  for await (const entry of dir.values()) {
    if (entry.kind === 'directory') {
      const child = entry as DirectoryHandle;
      yield* vstFiles(child, bundle ?? (isVst3(child.name) ? child.name : undefined));
      continue;
    }
    const file = entry as FileHandle;
    if (bundle) yield { handle: file, label: baseName(bundle) };
    else if (isVst3(file.name)) yield { handle: file, label: baseName(file.name) };
  }
}

const isVst3 = (name: string) => name.toLowerCase().endsWith('.vst3');
const baseName = (name: string) => name.replace(/\.vst3$/i, '');

/**
 * Which of `patterns` appear anywhere in the stream.
 *
 * A stream rather than the `File` it comes from, so a 30 MB plugin never sits
 * in memory whole - and so this is testable off a browser, where `File` has no
 * `stream()` at all.
 *
 * Chunks overlap by 15 bytes, one short of the pattern length. A class id
 * straddling a chunk boundary is otherwise the one thing this would never
 * find, and a miss reads exactly like the plugin not being installed.
 */
export async function searchStreamForUids(
  stream: ReadableStream<Uint8Array>,
  patterns: readonly { uid: string; forms: Uint8Array[] }[],
): Promise<string[]> {
  const hits: string[] = [];
  const overlap = 15;
  let carry = new Uint8Array(0);
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const buffer = concat(carry, value);
      for (const pattern of patterns) {
        if (hits.includes(pattern.uid)) continue;
        if (pattern.forms.some((form) => containsBytes(buffer, form))) hits.push(pattern.uid);
      }
      if (hits.length === patterns.length) break;
      carry = buffer.subarray(Math.max(0, buffer.length - overlap)).slice();
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return hits;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b;
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

/** Naive search, gated on the first byte. Fast enough: a plugin folder is read once and cached. */
export function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  const last = haystack.length - needle.length;
  outer: for (let i = 0; i <= last; i++) {
    if (haystack[i] !== needle[0]) continue;
    for (let j = 1; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}
