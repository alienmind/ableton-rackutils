/**
 * Opening a rack through a handle the page can write back to (doc/PLAN.md
 * 4.6).
 *
 * `<input type="file">` gives bytes and nothing else, so the only way back out
 * is a download the user then has to find and drag into place. The File System
 * Access API gives a HANDLE, and a handle can be written over - the file the
 * user opened, in the folder Live already reads.
 *
 * Two rules this obeys, both from the plan:
 *
 * - **Read-only by default.** Opening never asks for write permission. That is
 *   requested at the moment of saving, on a file the user names by saving it.
 * - **Detect, never assume.** The API is Chromium's today. Firefox and Safari
 *   get the file input and the download, which is why both stay.
 *
 * Writing over the original raises the stakes on Constraint 4: a mutation that
 * permutes variation values wrongly used to cost a download; now it can cost
 * the file.
 */

export interface WritableFile {
  file: File;
  /** Absent when the file came from an input or a drop the browser gave no handle for. */
  handle: FileHandle | null;
}

interface FileHandle {
  name: string;
  createWritable(): Promise<{ write(data: BufferSource): Promise<void>; close(): Promise<void> }>;
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  getFile(): Promise<File>;
}

interface PickerWindow extends Window {
  showOpenFilePicker?: (options?: {
    types?: { description: string; accept: Record<string, string[]> }[];
    multiple?: boolean;
  }) => Promise<FileHandle[]>;
}

const ADG_TYPE = {
  description: 'Ableton Device Group',
  accept: { 'application/gzip': ['.adg'] },
};

export function canOpenWithHandle(): boolean {
  return typeof window !== 'undefined' && typeof (window as PickerWindow).showOpenFilePicker === 'function';
}

/** Null when the user closes the picker, which is not an error. */
export async function openRackFile(): Promise<WritableFile | null> {
  const picker = (window as PickerWindow).showOpenFilePicker;
  if (!picker) return null;
  try {
    const [handle] = await picker({ types: [ADG_TYPE], multiple: false });
    if (!handle) return null;
    return { file: await handle.getFile(), handle };
  } catch {
    return null;
  }
}

/**
 * The handle behind a dropped file, where the browser offers one.
 *
 * A drop carries a `File` either way; `getAsFileSystemHandle` is what makes it
 * the same kind of thing the picker returns, so a dropped rack can be saved
 * back over itself instead of being a second-class way in.
 */
export async function handleFromDrop(item: DataTransferItem | undefined): Promise<FileHandle | null> {
  const asHandle = (item as unknown as { getAsFileSystemHandle?: () => Promise<FileHandle | null> } | undefined)
    ?.getAsFileSystemHandle;
  if (!asHandle || !item) return null;
  try {
    const handle = await asHandle.call(item);
    return handle && typeof handle.createWritable === 'function' ? handle : null;
  } catch {
    return null;
  }
}

/**
 * Write over the file the handle came from.
 *
 * Permission is asked for HERE and not at open time: a user who only wanted to
 * look at a rack is never prompted about writing to it. A denial is a plain
 * failure and the download stays available.
 */
export async function saveInPlace(handle: FileHandle, bytes: Uint8Array): Promise<void> {
  const granted = await ensureWritePermission(handle);
  if (!granted) throw new Error('permission to write that file was not given - use Export instead');
  const writable = await handle.createWritable();
  await writable.write(bytes as unknown as BufferSource);
  await writable.close();
}

async function ensureWritePermission(handle: FileHandle): Promise<boolean> {
  const descriptor = { mode: 'readwrite' } as const;
  if (await handle.queryPermission?.(descriptor).then((s) => s === 'granted')) return true;
  if (!handle.requestPermission) return true; // no permissions API here: let the write itself fail
  return (await handle.requestPermission(descriptor)) === 'granted';
}
