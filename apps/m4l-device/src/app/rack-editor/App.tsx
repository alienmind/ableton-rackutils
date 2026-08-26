/**
 * rack-editor - the companion device (doc/PLAN.md). An audio effect with a
 * passthrough chain: it can sit on any track without changing what plays,
 * because it targets a rack, it does not process audio.
 *
 * The device VIEW is this and nothing more: a button that opens the editor.
 * Live gives it about 169 px and it does not scroll, so everything else
 * happens in the window - which holds the same web app the site serves,
 * bundled beside the `.amxd` (see surface.ts).
 *
 * It adds no editing capability. Anyone who has the site has everything the
 * device does; what it adds is reach - the editor inside Live, with no browser
 * and no network.
 *
 * What it deliberately does NOT do is list the racks on this track. LOM can
 * enumerate their names and nothing else: it cannot read their mappings
 * (Constraint 1) and it cannot find their files (Constraint 2), so the list
 * would be a file picker wearing a costume. The rack has to be saved from Live
 * and dropped into the window either way.
 *
 *   pnpm dev
 *
 * runs this in a browser with a mocked Live beside it. No Live, no Max needed.
 */
import { useWindow } from "@m4l-jweb/surface/react";
import { useDevice } from "../shared/device";
import { Frame } from "../shared/Frame";
import surface from "./surface";

export default function App() {
  const device = useDevice();
  const editor = useWindow(surface, "editor");

  return (
    <Frame title="rack-editor" device={device}>
      <dt>editor</dt>
      <dd className="row">
        <button type="button" onClick={editor.open}>
          Open
        </button>
        <em className="hint">Save the rack from Live first - drag it into the window that opens.</em>
      </dd>
    </Frame>
  );
}
