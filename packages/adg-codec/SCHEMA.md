# .adg Schema Findings

**Status: EMPTY. Do not write `parse.ts` or `mutate.ts` until this is filled in.**

Every element name in the codec must be traceable to a diff recorded here.
Guessing element names produces files that open in Live without complaint and
behave incorrectly, which is the worst available failure mode.

Prior art worth reading first: `alienmind/patchbay` documents much of this for
Live 12.4.3 in `doc/ARCHITECTURE.md` and `doc/SCHEMA.md`. Read it, then verify
against your own racks rather than trusting it blindly.

## Procedure

```bash
# 1. Save a rack as A.adg
# 2. In Live, make exactly ONE change
# 3. Save as B.adg
pnpm adg-inspect unpack A.adg > A.xml
pnpm adg-inspect unpack B.adg > B.xml
diff A.xml B.xml
```

`unpack` normalizes away `Id`, `PointeeId`, `LomId`, `LomIdView` so the diff is
readable. Use `unpack --raw` when you specifically need to see them.

## Fixtures needed

Three structurally different racks, all answers verified against each:

- [ ] `simple.adg` - instrument rack, a few mapped macros, no variations
- [ ] `with-variations.adg` - same, plus at least 3 Macro Variations
- [ ] `drum-nested.adg` - drum rack, pad rack, Pitch, engine rack (3 levels)

Fixtures are gitignored. Keep them in a local `tests/fixtures/`.

---

## Q1. Where does a macro's mapping live?

Change a macro from unmapped to mapped. Diff.

**Answer:**

```
(paste diff)
```

## Q2. How is the mapping target identified?

By id reference, by path string, or both? Determines whether moving a mapping
is a cheap node move or requires rewriting references.

**Answer:**

## Q3. What changes when a mapping moves from macro 2 to macro 3?

This diff IS the specification for `moveMapping`.

**Answer:**

## Q4. Where are range and inversion stored?

Set a non-default mapping range. Separately, invert it (min > max). Two diffs.

**Answer:**

## Q5. Where are variations stored, and how are they keyed?

Build a rack with 3 variations, diff against the same rack with 2. Confirm the
per-macro value array is positional.

**Answer:**

## Q6. What does Live do to variations when IT moves a mapping?

Repeat Q3 on a rack that has variations. **This defines correct behavior.**
Specifically: what value does the vacated slot receive? 0, 64, the macro's own
default, or is the entry removed?

This answers `DEFAULT_MACRO_VALUE` in `mutate.ts`. Getting it wrong silently
breaks every variation in every rack the tool touches.

**Answer:**

Save the resulting file as `tests/fixtures/move-after-live.adg`. The strongest
test available is asserting our output matches Live's own for the same edit.

## Q7. Where is the macro count stored?

Live 11+ allows 1..16 visible macros per rack. Do not hardcode 8.

**Answer:**

## Q8. How is nesting represented?

Drum Rack, pad rack, Pitch, engine rack. Is the recursion uniform at each
level, or does the drum rack differ?

**Answer:**

---

## Q9 (LOM, not file). Macro slot to parameter index

Not answered by diffing. Needed for the companion device's live overlay.

For a rack device, `device.parameters[0]` is Device On and `[1]` is typically
Chain Selector, so macro N is NOT `parameters[N]`. Confirm the offset for each
rack type, especially drum racks, and resolve by NAME rather than assuming a
fixed offset.

**Answer:**
