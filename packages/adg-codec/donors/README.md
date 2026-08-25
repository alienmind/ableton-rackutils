# Donors

Real device instances, saved by Live, for the contract to copy from. Never
generate device XML from scratch: see `doc/PLAN.md` Constraint 7.

`.adg` is gitignored repo-wide because real racks are personal data. This
directory is the one exception, negated in `.gitignore`, because a donor has to
ship with the code for device insertion to work at all.

## What a donor is for

Its parameter list and each parameter's element path, not anybody's settings. A
binding written from imagination is wrong; a binding written against a donor is
checkable.

## `PD.adg`

An instrument rack (`InstrumentGroupDevice`), 16 visible macros, one variation.
The harvest source for every device the contract can currently insert:

| Device | Tag | Used by |
|---|---|---|
| Utility | `StereoGain` | Utility Gain option |
| Gate | `Gate` | Gate option |
| Compressor | `Compressor2` | Compressor option |
| Auto Filter | `AutoFilter2` | AutoFilter option |
| EQ Eight | `Eq8` | not an option yet |
| Delay | `Delay` | not an option yet |
| Reverb | `Reverb` | not an option yet |
| Drift | `Drift` | instrument, not insertable |

Two things it establishes beyond the tags:

- **Live 12 writes `AutoFilter2`, not `AutoFilter`.** patchbay's donor set has
  the older tag. Insert what Live writes today.
- **A saved preset does not carry an external sidechain source.** Both the Gate
  and the Compressor here were routed to a separate track when this rack was
  saved. The file keeps `SideChain/OnOff/Manual = true` and holds
  `Target = AudioIn/None`, `UpperDisplayString = No Output`. The switch
  survives the save, the source does not. This file is the evidence for
  SCHEMA.md Q14.

It is also the case that forces a parent rack: all 16 macro slots are in use,
so there is no room to shift the contract's macros in. See `doc/PLAN.md` 4.3.3,
where wrapping is a last resort rather than a choice.

## Adding a device the contract can insert

Put it in a rack in Live, save, drop the file here, and record what it yields
in the table above. One harvest source with many devices is fine; what matters
is that every insertable device traces to a file in this directory.

## `BS.adg`

An instrument rack with **two parallel terminal chains**, and the reference case
for how the contract applies (`doc/PLAN.md` 4.3.3): one device per chain, one
macro driving every instance.

| Macro | Name | Drives |
|---|---|---|
| 1 | BS SELECT | the rack's own `ChainSelector` |
| 2 | Dist | `Output_DryWet` on a `Roar` in each chain |
| 3 | LPF | `Filter_Frequency` on a `Drift`, and `Freq` on an `Eq8` band |
| 4 | Pluck / Long | four envelope sustains across `Drift` and `InstrumentMeld` |
| 5 | BS GAIN | `Gain` on a `StereoGain` in each chain |
| 6-8 | ARP * | `On`, `TransposeSteps`, `Mode` on a `MidiArpeggiator` in each chain |
| 9 | GATE ON/OFF | `On` on a `Gate` in each chain |

Two findings came out of it:

- **A macro can drive the rack's own parameters** (SCHEMA.md Q15). Macro 1's
  binding sits on `ChainSelector`, a sibling of `BranchPresets`, where the
  codec was not looking. That is a correctness bug, `doc/PLAN.md` 4.0.
- **Targets need not match across chains.** Macro 3 drives a different
  parameter of a different device in each chain. The codec must keep reading
  that; the contract does not author it (`doc/PLAN.md` 4.3.3).

Its hand-picked macro colours closed SCHEMA.md Q13: index 13 is white and index
69, the last swatch in Live's picker, is grey, so grid position is the stored
index.

## `BS-VST3.adg`

`BS.adg` with a third chain whose instrument is an Arturia VST3 instead of
`InstrumentMeld`. The only donor holding a plugin, and the evidence for
SCHEMA.md Q17:

- A plugin is a `Vst3Preset`, a sibling wrapper of `AbletonDevicePreset` with
  no `Device` child.
- It carries a `Uid` of four 32-bit ints and **no plugin name**. The chain is
  called `MiniBrute` because its author named it that, not because the file
  says so.
- The codec reads it as a device of type `Vst3Preset` with 0 parameters:
  parameter discovery keys on `MidiControllerRange` (Q11) and a plugin exposes
  none.

Also the only donor with three chains, which makes it the better fixture for
anything that has to hold across more than a pair.

## `BS-EQ3.adg`

`BS-VST3.adg` with an EQ Three added to the plugin chain and its three band
gains mapped to macros 10-12, plus one parameter of the VST3 exposed through
Live's Configure mode.

Two findings:

- **EQ Three is `FilterEQ3`**, band gains `GainLo`, `GainMid`, `GainHi`, in
  linear amplitude (SCHEMA.md Q21). It is the harvest source for the EQ Three
  option, the last one that had no donor.
- **An exposed plugin parameter is a `PluginParameterSettings`** carrying
  `ParameterId`, `Type` and `MacroControlIndex` - an integer, not a `KeyMidi`
  (SCHEMA.md Q20). The macro index reads -1 here, so the mapped state is still
  unconfirmed.

## `BS-VST3-mapped.adg`

`BS-EQ3.adg` with the exposed plugin parameter actually mapped, to macro 13.
The evidence that closed SCHEMA.md Q20: `MacroControlIndex` holds the 0-based
macro index, the range nests a `MidiControllerRange` inside another one, and
`LomId` goes non-zero.

It is the only donor exercising the plugin binding path, so it is what the
slot-changing mutations are tested against.


## `KD.adg`

A drum rack (`DrumGroupDevice`), four pads, each holding an instrument rack,
one of them holding another. The first donor that is a rack of racks, and the
evidence for SCHEMA.md Q22 and Q23:

- **A parent macro drives a child rack's macro by a `KeyMidi` on the child's
  own `MacroControls.N`.** Six of this rack's ten macros are that shape, and
  the codec credited every one of them to the child until Q22.
- **The same device element also carries the child's own `ChainSelector`
  binding**, which belongs to the child (Q15). So depth does not decide the
  owner; the parameter does.
- **Five of its macros have no name** and Live labels them after what they
  drive - `Rumble Length`, `Atmo Gain` - which is Q23.

Nothing is harvested from it. It is a fixture, not a device source: its job is
to keep the ownership rules honest on the shape a drum rack always has.
