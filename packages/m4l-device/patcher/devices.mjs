/**
 * devices.mjs - the device manifest. This is what you edit to change the shape
 * of a device; the patcher is generated from it, so patch cords become code
 * review rather than pixels.
 *
 * See doc/PLAN.md Phase 5.2 in the repo root: rack-editor is an AUDIO EFFECT
 * with a "passthrough" chain, not an instrument or MIDI effect - it can sit on
 * any track without changing what plays, because it is a tool, not a sound
 * source. It declares no automatable params: nothing here needs Push or
 * automation, only the device view / floating window UI.
 */
export default [
  {
    name: "rack-editor",
    type: "audio",
    chains: ["passthrough"],
    unmatchedTo: "js",
  },
];
