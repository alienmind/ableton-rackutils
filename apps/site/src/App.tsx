import { useCallback, useRef, useState } from 'react';
import { Rack, isGzip } from '@rackutils/adg-codec';
import { RackEditor } from '@rackutils/editor-ui';
import '@rackutils/editor-ui/src/editor.css';
import { Landing, LandingGuide } from './Landing';
import { canOpenWithHandle, handleFromDrop, openRackFile, saveInPlace, type WritableFile } from './fileAccess';

/**
 * The Max for Live bundle goes straight to the work: load a rack, author it.
 * The device window is small and its user installed the thing on purpose, so
 * the landing chrome is dropped at BUILD time - see `Landing.tsx` - rather
 * than merely hidden (doc/PLAN.md 4.7).
 */
const EMBEDDED = import.meta.env.VITE_EMBED === '1';

interface Loaded {
  fileName: string;
  rack: Rack;
  /**
   * Set when the rack came in through a picker or a drop the browser gave a
   * handle for - the one way the edited file can go back over the original
   * (doc/PLAN.md 4.6). Null means Export, and only Export.
   */
  handle: WritableFile['handle'];
}

export default function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Overwriting is two clicks, and the second one names the file. A rack this
  // tool got wrong used to cost a download; over the original it costs the
  // rack (Constraint 4).
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadFile = useCallback(async (file: File, handle: WritableFile['handle'] = null) => {
    setError(null);
    setConfirmingOverwrite(false);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isGzip(bytes)) throw new Error(`${file.name} is not a gzipped .adg file`);
      setLoaded({ fileName: file.name, rack: Rack.parse(bytes), handle });
    } catch (err) {
      setLoaded(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // The picker where there is one, the file input everywhere else. Opening
  // through the picker is what makes saving in place possible later; it asks
  // for nothing beyond reading.
  const openWithPicker = useCallback(async () => {
    const opened = await openRackFile();
    if (opened) await loadFile(opened.file, opened.handle);
  }, [loadFile]);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      // The handle has to be asked for before the event is done with, so the
      // item is taken here and awaited after.
      const item = e.dataTransfer.items[0];
      if (file) void handleFromDrop(item).then((handle) => loadFile(file, handle));
    },
    [loadFile],
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  // Downloads a copy under a new name. The original file on disk is never
  // touched - the read-only-until-proven default from doc/PLAN.md, which
  // belongs at the call site rather than inside the editor component.
  const save = useCallback(() => {
    if (!loaded) return;
    const url = URL.createObjectURL(new Blob([loaded.rack.serialize() as BlobPart], { type: 'application/gzip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName(loaded);
    a.click();
    URL.revokeObjectURL(url);
  }, [loaded]);

  const overwrite = useCallback(async () => {
    if (!loaded?.handle) return;
    setConfirmingOverwrite(false);
    setError(null);
    try {
      await saveInPlace(loaded.handle, loaded.rack.serialize());
      setSaved(loaded.fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loaded]);

  return (
    <div className={`app${EMBEDDED ? ' app-embedded' : ''}`}>
      <Landing compact={loaded !== null} />

      {/*
        * In and out, side by side and the same size.
        *
        * Saving used to be one small icon inside the features strip, which is
        * the wrong place for the thing the whole tool is for: the rack has to
        * get back to Live. It is half the row now, opposite the way in.
        */}
      <div className="transfer">
        <div
          className={`dropzone${dragOver ? ' dropzone-active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <p className="transfer-title">
            {loaded ? (
              <>
                <strong>{loaded.fileName}</strong> loaded
              </>
            ) : (
              EMBEDDED ? 'Save the rack from Live first' : 'Drop a rack here'
            )}
          </p>
          {/* One button, two ways in. Where the browser has a picker it is
              used, because it comes back with a HANDLE and that is what lets
              the edited rack go back over the file it came from. Everywhere
              else it opens the file input, which is the same gesture to a user
              and a one-way door for the bytes. */}
          <button
            type="button"
            className="transfer-button"
            onClick={() => (canOpenWithHandle() ? void openWithPicker() : fileInput.current?.click())}
          >
            {loaded ? 'Open another rack' : 'Open a rack'}
          </button>
          <input ref={fileInput} className="file-input" type="file" accept=".adg" onChange={onFileInput} />
          <p className="transfer-note">.adg, read in this tab. Nothing is uploaded.</p>
        </div>

        <div className="exportzone">
          <p className="transfer-title">{loaded ? <>Save it back to Live</> : 'Nothing to save yet'}</p>
          <button type="button" className="transfer-button" onClick={save} disabled={!loaded}>
            Export .adg
          </button>

          {/* Over the original, and only when the rack came in through a
              handle. Two clicks, the second naming the file, because this is
              the one control in the tool that can destroy a rack rather than
              produce another copy of one (doc/PLAN.md 4.6). */}
          {loaded?.handle &&
            (confirmingOverwrite ? (
              <p className="overwrite-confirm">
                <button type="button" className="overwrite-yes" onClick={() => void overwrite()}>
                  Overwrite {loaded.fileName}
                </button>
                <button type="button" className="overwrite-no" onClick={() => setConfirmingOverwrite(false)}>
                  cancel
                </button>
              </p>
            ) : (
              <button type="button" className="transfer-secondary" onClick={() => setConfirmingOverwrite(true)}>
                Save over the original
              </button>
            ))}

          <p className="transfer-note">
            {saved === loaded?.fileName
              ? `Saved over ${saved}. Reload the rack in Live to hear it.`
              : loaded
                ? `Downloads as ${downloadName(loaded)}. Drag it onto the rack in Live to load it.`
                : 'Open a rack to edit it.'}
          </p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {/* Under the two controls, not above them: one line each, with the
          walkthrough and the device's small print behind a question mark. */}
      <LandingGuide compact={loaded !== null} />

      {loaded && (
        <section className="rack-view">
          <RackEditor
            rack={loaded.rack}
            onChange={(rack) => {
              setSaved(null);
              setLoaded({ ...loaded, rack });
            }}
          />
        </section>
      )}
    </div>
  );
}

/**
 * What the saved file is called: the rack's name, which the features strip
 * also writes - one name on the rack, on its macros, on the devices the
 * contract added, and on the file (doc/PLAN.md 4.3.1). Falls back to the file
 * it came from.
 */
function downloadName(loaded: Loaded): string {
  const code = loaded.rack.name.replace(/[\\/:*?"<>|]/g, '').trim();
  return code ? `${code}.adg` : `${loaded.fileName.replace(/\.adg$/i, '')}-edited.adg`;
}
