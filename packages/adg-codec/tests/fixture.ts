/**
 * A minimal, hand-built .adg-shaped rack for unit tests, synthetic so it runs
 * in CI without a real Ableton file. Every element name and nesting shape
 * here is traced to SCHEMA.md (Q1, Q2, Q5, Q7, Q8) and to the raw structure
 * observed in the project's own real fixtures (packages/adg-codec/tests/fixtures/,
 * gitignored, not available in CI - hence this).
 *
 * Shape: one outer instrument rack with three parameters - `ParamA` AND
 * `ParamC` BOTH mapped to macro 0 (a macro driving two parameters at once is
 * normal Live usage, not an edge case - a real rack exposed a bug here where
 * `moveMapping` only moved one of a macro's several targets), `ParamB`
 * unmapped - and a nested rack whose OWN macro 0 is also mapped, which
 * exercises the owning-rack walk (SCHEMA.md Q2): naively matching on
 * NoteOrController alone would wrongly pick up the nested rack's mapping as
 * the outer rack's macro 0.
 */
import { compress } from '../src/gzip';

function keyMidiXml(macroIndex: number): string {
  return `<KeyMidi><PersistentKeyString Value="" /><IsNote Value="false" /><Channel Value="16" /><NoteOrController Value="${macroIndex}" /><LowerRangeNote Value="-1" /><UpperRangeNote Value="-1" /><ControllerMapMode Value="0" /></KeyMidi>`;
}

function macroSlots(mapped: Record<number, number> = {}, colors: Record<number, number> = {}): string {
  let xml = '';
  for (let i = 0; i < 16; i++) {
    const value = mapped[i] ?? 0;
    xml += `<MacroControls.${i}><LomId Value="0" /><Manual Value="${value}" /><MidiControllerRange><Min Value="0" /><Max Value="127" /></MidiControllerRange></MacroControls.${i}>`;
    xml += `<MacroDisplayNames.${i} Value="Macro ${i + 1}" />`;
    xml += `<MacroColor.${i} Value="${colors[i] ?? 0}" />`;
    // The rest of the per-slot families (SCHEMA.md Q7), all 16 of each, as
    // every real rack carries them. Annotations and defaults are given
    // per-index values so a reorder or swap that drops one is visible in a
    // test rather than silently passing.
    xml += `<MacroAnnotations.${i} Value="note ${i}" />`;
    xml += `<MacroDefaults.${i} Value="${i}" />`;
    xml += `<ForceDisplayGenericValue.${i} Value="false" />`;
    xml += `<ExcludeMacroFromRandomization.${i} Value="${i === 1}" />`;
    xml += `<ExcludeMacroFromSnapshots.${i} Value="false" />`;
  }
  return xml;
}

function snapshot(name: string, values: Record<number, number> = {}): string {
  let xml = `<MacroSnapshot><SnapshotName Value="${name}" />`;
  for (let i = 0; i < 16; i++) xml += `<MacroValues.${i} Value="${values[i] ?? -1}" />`;
  for (let i = 0; i < 16; i++) xml += `<MacroHasValue.${i} Value="${i in values ? 'true' : 'false'}" />`;
  xml += `</MacroSnapshot>`;
  return xml;
}

export interface FixtureOptions {
  /** Include 2 Macro Variations, values for macro 0/1. */
  withVariations?: boolean;
}

export function buildFixtureXml(opts: FixtureOptions = {}): string {
  const variations = opts.withVariations
    ? `<MacroVariations><MacroSnapshots>${snapshot('Variation 1', { 0: 40, 1: 80 })}${snapshot('Variation 2', { 0: 90, 1: 20 })}</MacroSnapshots></MacroVariations>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Ableton MajorVersion="5" MinorVersion="12.0_12402" SchemaChangeCount="5" Creator="test fixture">
  <GroupDevicePreset>
    <Device>
      <InstrumentGroupDevice>
        <UserName Value="Test Rack" />
        <NumVisibleMacroControls Value="8" />
        ${macroSlots({ 0: 25.4 }, { 0: 3, 1: 7 })}
        ${variations}
      </InstrumentGroupDevice>
    </Device>
    <BranchPresets>
      <InstrumentBranchPreset>
        <Name Value="" />
        <DevicePresets>
          <AbletonDevicePreset>
            <Device>
              <TestSynth>
                <ParamA>
                  <Name Value="ParamA" />
                  <Timeable>
                    <LomId Value="0" />
                    ${keyMidiXml(0)}
                    <Manual Value="25.4" />
                    <MidiControllerRange><Min Value="0" /><Max Value="100" /></MidiControllerRange>
                  </Timeable>
                </ParamA>
                <ParamB>
                  <Name Value="ParamB" />
                  <Timeable>
                    <LomId Value="0" />
                    <Manual Value="0" />
                    <MidiControllerRange><Min Value="0" /><Max Value="1" /></MidiControllerRange>
                  </Timeable>
                </ParamB>
                <ParamC>
                  <Name Value="ParamC" />
                  <Timeable>
                    <LomId Value="0" />
                    ${keyMidiXml(0)}
                    <Manual Value="60" />
                    <MidiControllerRange><Min Value="0" /><Max Value="127" /></MidiControllerRange>
                  </Timeable>
                </ParamC>
              </TestSynth>
            </Device>
          </AbletonDevicePreset>
          <GroupDevicePreset>
            <Device>
              <InstrumentGroupDevice>
                <UserName Value="Nested Rack" />
                <NumVisibleMacroControls Value="8" />
                ${macroSlots()}
              </InstrumentGroupDevice>
            </Device>
            <BranchPresets>
              <InstrumentBranchPreset>
                <Name Value="" />
                <DevicePresets>
                  <AbletonDevicePreset>
                    <Device>
                      <InnerSynth>
                        <InnerParam>
                          <Name Value="InnerParam" />
                          <Timeable>
                            <LomId Value="0" />
                            ${keyMidiXml(0)}
                            <Manual Value="0" />
                            <MidiControllerRange><Min Value="0" /><Max Value="1" /></MidiControllerRange>
                          </Timeable>
                        </InnerParam>
                      </InnerSynth>
                    </Device>
                  </AbletonDevicePreset>
                </DevicePresets>
              </InstrumentBranchPreset>
            </BranchPresets>
          </GroupDevicePreset>
        </DevicePresets>
      </InstrumentBranchPreset>
    </BranchPresets>
  </GroupDevicePreset>
</Ableton>`;
}

export function buildFixtureBytes(opts?: FixtureOptions): Uint8Array {
  return compress(buildFixtureXml(opts));
}
