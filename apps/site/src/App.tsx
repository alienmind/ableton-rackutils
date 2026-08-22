import { useCallback, useState } from 'react';
import { decompress, isGzip } from '@rackutils/adg-codec';
import { RackTree } from './RackTree';

interface LoadedRack {
  fileName: string;
  doc: XMLDocument;
  elementCount: number;
}

export default function App() {
  const [rack, setRack] = useState<LoadedRack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const loadFile = useCallback(async (file: File) => {
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isGzip(bytes)) {
        throw new Error(`${file.name} is not a gzipped .adg file`);
      }
      const xml = decompress(bytes);
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        throw new Error(`could not parse XML in ${file.name}`);
      }
      setRack({
        fileName: file.name,
        doc,
        elementCount: doc.querySelectorAll('*').length,
      });
    } catch (err) {
      setRack(null);
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

  return (
    <div className="app">
      <header>
        <h1>
          ableton-rackutils <span className="badge">v0.0.1 pre-alpha</span>
        </h1>
        <p className="tagline">
          Drag in a rack (.adg) to inspect it. Nothing leaves this tab: the file is
          parsed entirely in the browser.
        </p>
      </header>

      <div
        className={`dropzone${dragOver ? ' dropzone-active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {rack ? (
          <p>
            <strong>{rack.fileName}</strong> loaded, {rack.elementCount} elements. Drop
            another file to replace it.
          </p>
        ) : (
          <p>Drop a .adg file here, or</p>
        )}
        <label className="file-input-label">
          choose a file
          <input type="file" accept=".adg" onChange={onFileInput} />
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      {rack && (
        <section className="rack-view">
          <h2>Raw structure</h2>
          <p className="note">
            This is a schema-agnostic tree view, not the macro editor yet. The .adg
            schema is still being reverse-engineered (see{' '}
            <code>packages/adg-codec/SCHEMA.md</code>), so nothing here is
            interpreted as a macro or a mapping. Collapsed by default, click to
            expand.
          </p>
          <RackTree root={rack.doc.documentElement} />
        </section>
      )}
    </div>
  );
}
