/**
 * surface.ts - the device's Live parameters and its window.
 *
 * rack-editor has no parameters. It is a tool (doc/PLAN.md), not an
 * instrument or effect with a sound to automate - nothing here belongs on Push
 * or in an automation lane.
 *
 * It has one window, and that window is the product: the same web app the site
 * serves, built for the device and delivered as a folder beside the `.amxd`
 * (`site/`, written by scripts/bundle-site.mjs). The device adds no editing
 * capability; it makes the editor reachable inside Live with no browser and no
 * network, which is the case for authoring a rack on a flight.
 *
 * `alwaysOnTop` stays off deliberately: this is a window you WORK in, so the
 * default - it goes behind Live when Live is clicked - is the right one.
 */
import { defineSurface } from "@m4l-jweb/surface";

export default defineSurface({
  params: {},
  windows: {
    editor: {
      kind: "window",
      title: "ableton-rackutils",
      // Wide enough for a rack row plus the features strip, tall enough for
      // the mapping table under it. The device VIEW is 169 px and does not
      // scroll; the window has no such limit.
      width: 1280,
      height: 860,
      site: "site",
    },
  },
});
