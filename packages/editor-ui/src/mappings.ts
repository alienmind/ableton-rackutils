import type { Macro, Rack } from '@rackutils/adg-codec';
import { macroColor } from './macroColors';

export interface MappingTarget {
  /** The device that owns the parameter, e.g. "Reverb". */
  device: string;
  /** The parameter itself, e.g. "DecayTime". */
  parameter: string;
  targetPath: string;
  /** In the target parameter's own units, not 0..127 (SCHEMA.md Q4). */
  rangeMin: number;
  rangeMax: number;
  /** Stored as Min > Max, which Live drives backwards. */
  inverted: boolean;
}

export interface MacroMapping {
  rackName: string;
  rackPath: readonly string[];
  macroIndex: number;
  macroName: string;
  color: string;
  targets: MappingTarget[];
}

/**
 * Every mapping in the whole rack tree, as a flat list of
 * rack -> macro -> (device -> parameter) rows.
 *
 * A macro knob has room for one or two target names before the knob grid
 * stops being a grid, and a real rack routinely has a macro driving several
 * parameters. So the knob shows a summary and the full picture lives in one
 * list underneath, which can be as long as it likes.
 *
 * `Binding` carries the parameter's name but not the DEVICE it belongs to,
 * which is the half that makes a row readable ("Reverb -> DecayTime", not just
 * "DecayTime" - three devices in a chain can each have a DryWet). The device
 * is recovered by walking the rack's own device tree and indexing parameters
 * by path.
 */
/**
 * What to call a macro. Live labels one nobody has renamed after the thing it
 * drives (SCHEMA.md Q23), which is what makes a rack of racks readable: the
 * parent's knob reads `KICK SEL` because that is the child macro at the other
 * end of it.
 *
 * The default name is `Macro N`, exactly what `MacroDisplayNames.N` holds
 * until somebody types something else.
 */
export function macroLabel(macro: Macro): string {
  // Any `Macro N`, not only this slot's own number: moving a macro carries its
  // stored name along, so an unnamed macro 1 dropped on slot 3 still reads
  // `Macro 1` in the file and is still a macro nobody has named.
  const named = !/^Macro \d+$/.test(macro.name);
  if (named || macro.bindings.length === 0) return macro.name;
  return macro.bindings[0].targetName;
}

export function collectMappings(root: Rack): MacroMapping[] {
  const rows: MacroMapping[] = [];

  const visit = (rack: Rack, path: readonly string[]) => {
    const deviceOf = new Map<string, string>();
    const walkChains = (chains: readonly { devices: readonly { name: string; parameters: readonly { path: string }[]; isRack: boolean; chains: readonly unknown[] }[] }[]) => {
      for (const chain of chains) {
        for (const device of chain.devices) {
          for (const param of device.parameters) deviceOf.set(param.path, device.name);
          if (device.isRack) walkChains(device.chains as Parameters<typeof walkChains>[0]);
        }
      }
    };
    walkChains(rack.chains as Parameters<typeof walkChains>[0]);

    for (const macro of rack.macros as readonly Macro[]) {
      if (macro.bindings.length === 0) continue;
      rows.push({
        rackName: rack.name,
        rackPath: path,
        macroIndex: macro.index,
        macroName: macroLabel(macro),
        color: macroColor(macro.color),
        targets: macro.bindings.map((b) => ({
          // Falls back to the rack itself, which is where a binding on a
          // rack's own parameter lives - ChainSelector (SCHEMA.md Q15) has no
          // device to belong to.
          device: deviceOf.get(b.targetPath) ?? rack.name,
          parameter: b.targetName,
          targetPath: b.targetPath,
          rangeMin: b.rangeMin,
          rangeMax: b.rangeMax,
          inverted: b.inverted,
        })),
      });
    }

    // Nested racks own their own macros and mappings (SCHEMA.md Q2), so each
    // is visited in its own right rather than folded into its parent's rows.
    for (const chain of rack.chains) {
      for (const device of chain.devices) {
        if (!device.isRack) continue;
        const nested = rack.subRack(device.path);
        if (nested) visit(nested, [...path, device.path]);
      }
    }
  };

  visit(root, []);
  return rows;
}
