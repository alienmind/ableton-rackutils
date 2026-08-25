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

It also happens to be the case that forces the wrap option: all 16 macro slots
are already in use, so there is no room to shift the contract's macros in
without a parent rack.

## Adding a device the contract can insert

Put it in a rack in Live, save, drop the file here, and record what it yields
in the table above. One harvest source with many devices is fine; what matters
is that every insertable device traces to a file in this directory.
