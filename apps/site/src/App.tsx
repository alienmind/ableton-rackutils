import { useCallback, useState } from 'react';
import { Rack, isGzip } from '@rackutils/adg-codec';
import { RackEditor } from '@rackutils/editor-ui';
import '@rackutils/editor-ui/src/editor.css';
import { RackTree } from './RackTree';
import { Landing } from './Landing';

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
}

export default function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const loadFile = useCallback(async (file: File) => {
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isGzip(bytes)) throw new Error(`${file.name} is not a gzipped .adg file`);
      setLoaded({ fileName: file.name, rack: Rack.parse(bytes) });
    } catch (err) {
      setLoaded(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) void loadFile(file);
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
    a.download = loaded.fileName.replace(/\.adg$/i, '') + '-edited.adg';
    a.click();
    URL.revokeObjectURL(url);
  }, [loaded]);

  return (
    <div className={`app${EMBEDDED ? ' app-embedded' : ''}`}>
      <Landing compact={loaded !== null} />

      <div
        className={`dropzone${dragOver ? ' dropzone-active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {loaded ? (
          <p>
            <strong>{loaded.fileName}</strong> loaded. Drop another file to replace it.
          </p>
        ) : (
          <p>{EMBEDDED ? 'Save the rack from Live, then drop the .adg here, or' : 'Drop a .adg file here, or'}</p>
        )}
        <label className="file-input-label">
          choose a file
          <input type="file" accept=".adg" onChange={onFileInput} />
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      {loaded && (
        <section className="rack-view">
          <div className="rack-actions">
            <button type="button" className="save-button" onClick={save}>
              Save a copy
            </button>
            <label className="raw-toggle">
              <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} /> raw XML
            </label>
          </div>
          <p className="note">
            Drag a parameter onto a macro knob to bind it. Drag a knob onto another to move the whole
            macro, or hold Shift while dropping to swap two. Double-click a name to rename it. Saving
            downloads a copy - your original file is never touched; drag that copy back onto the rack in
            Live to load it.
          </p>

          <RackEditor rack={loaded.rack} onChange={(rack) => setLoaded({ ...loaded, rack })} />

          {showRaw && <RackTree root={loaded.rack.document.documentElement} />}
        </section>
      )}
    </div>
  );
}
