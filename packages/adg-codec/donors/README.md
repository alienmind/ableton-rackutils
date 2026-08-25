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

