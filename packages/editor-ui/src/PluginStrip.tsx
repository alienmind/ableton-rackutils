import { useCallback, useMemo, useState } from 'react';
import { uidAscii, type PluginRef, type Rack } from '@rackutils/adg-codec';
import { canScanPlugins, loadPluginNames, savePluginNames, scanForPlugins, type ScanProgress } from './pluginScan';

/**
 * What this rack needs in order to load: its plugins, above the rack
 * (doc/PLAN.md 4.1).
 *
 * Read only. It answers a question nothing else answers - will this rack load
 * on this machine, and what does it drag in - which matters for a rack from
 * somewhere else and for an old rack of your own built on a plugin you have
 * since removed.
 *
 * **The file names no plugin** (SCHEMA.md Q17). It stores a class id, and the
 * only readable string near one is the CHAIN name, which its author typed. So
 * an id is shown as itself until the user points at their plugin folder and
 * `pluginScan` finds which `.vst3` contains it, and a MISS is a real answer:
 * this machine cannot fully load this rack.
 *
 * Nothing here is offered as a mapping target. A plugin exposes no
 * `MidiControllerRange`, so the codec reports zero bindable parameters on one
 * (Q17), and what a macro drives on a plugin is a separate model (Q20).
 */
export interface PluginStripProps {
  rack: Rack;
}

interface PluginGroup {
  uid: string;
  /** Every instance of this plugin, so the strip can say where they are. */
  refs: PluginRef[];
}

/** One entry per plugin, not per instance: the same synth on four chains is one dependency. */
function groupByUid(plugins: readonly PluginRef[]): PluginGroup[] {
  const groups = new Map<string, PluginGroup>();
  for (const plugin of plugins) {
    const group = groups.get(plugin.uid);
    if (group) group.refs.push(plugin);
    else groups.set(plugin.uid, { uid: plugin.uid, refs: [plugin] });
  }
  return Array.from(groups.values());
}

/** Where a plugin sits, in the user's own words: the chain names, deduplicated. */
function whereItSits(group: PluginGroup): string {
  const chains = Array.from(new Set(group.refs.map((r) => r.chainName).filter(Boolean)));
  if (chains.length === 0) return group.refs.length > 1 ? `${group.refs.length} chains` : 'in this rack';
  return chains.join(', ');
}

export function PluginStrip({ rack }: PluginStripProps) {
  const groups = useMemo(() => groupByUid(rack.plugins), [rack]);
  // An empty string is "searched for, and not on this machine", which is a
  // different thing from an id nobody has looked for yet.
  const [names, setNames] = useState<Record<string, string>>(() => loadPluginNames());
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setError(null);
    setProgress({ searched: 0, current: '', found: 0 });
    try {
      const uids = groups.map((g) => g.uid);
      const result = await scanForPlugins(uids, setProgress);
      if (!result) return; // picker closed
      const merged = { ...names, ...result.names };
      for (const uid of uids) if (!(uid in result.names)) merged[uid] = '';
      setNames(merged);
      savePluginNames(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
    }
  }, [groups, names]);

  if (groups.length === 0) return null;

  const missing = groups.filter((g) => names[g.uid] === '').length;

  return (
    <section className="plugin-strip" aria-label="Plugins this rack needs">
      <header className="plugin-strip-head">
        <h3>
          Plugins <span className="plugin-count">{groups.length}</span>
        </h3>
        {progress ? (
          <span className="plugin-progress" role="status">
            searched {progress.searched}
            {progress.current ? ` - ${progress.current}` : ''}
          </span>
        ) : canScanPlugins() ? (
          <button type="button" className="plugin-scan" onClick={scan}>
            {Object.keys(names).length > 0 ? 'Scan again' : 'Find their names...'}
          </button>
        ) : (
          <span className="plugin-note">Naming them needs a browser that can open a folder - Chromium, for now.</span>
        )}
      </header>

      <ul className="plugin-list">
        {groups.map((group) => {
          const name = names[group.uid];
          const ascii = uidAscii(group.uid);
          return (
            <li key={group.uid} className={`plugin-item${name === '' ? ' plugin-missing' : ''}`}>
              {/* The id itself while nothing has resolved it. Some vendors
                  build a readable one - the Arturia id reads ArtuAVISMBRTProc
                  (SCHEMA.md Q17) - which is worth showing and not worth
                  presenting as the plugin's name, so it stays in the id slot. */}
              {name ? (
                <span className="plugin-name">{name}</span>
              ) : (
                <span className="plugin-uid" title={group.uid}>
                  {ascii ?? group.uid}
                </span>
              )}
              <span className="plugin-where">{whereItSits(group)}</span>
              {group.refs.length > 1 && <span className="plugin-instances">x{group.refs.length}</span>}
              {name === '' && <span className="plugin-state">not on this machine</span>}
            </li>
          );
        })}
      </ul>

      {error && <p className="plugin-error">{error}</p>}
      {missing > 0 && !progress && (
        <p className="plugin-note">
          {missing === 1 ? 'One plugin was' : `${missing} plugins were`} not found in the folder you picked. Live
          will load this rack without {missing === 1 ? 'it' : 'them'}.
        </p>
      )}
    </section>
  );
}
