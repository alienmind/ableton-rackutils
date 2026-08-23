/**
 * surface.ts - the device's Live parameters, declared as code.
 *
 * rack-editor has none. It is a tool (see doc/PLAN.md Phase 5), not an
 * instrument or effect with a sound to automate - nothing here needs to show
 * up on Push or in an automation lane. This file exists because every device
 * needs a surface, not because there is anything to declare in it yet.
 */
import { defineSurface } from "@m4l-jweb/surface";

export default defineSurface({
  params: {},
});
