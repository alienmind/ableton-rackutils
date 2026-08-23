/**
 * rack-editor - the companion device (doc/PLAN.md Phase 5). An audio effect
 * with a passthrough chain: it can sit on any track without changing what
 * plays, because it targets a rack, it does not process audio.
 *
 * This is the scaffold stage: the device view confirms the bridge is alive
 * (mode/build/transport from useDevice) and nothing else yet. What it needs
 * next, per the plan, is NOT here yet:
 *   - useSelectedDevice() to show which rack is targeted (Phase 5.1.4)
 *   - a floating window carrying the actual RackEditor UI from
 *     packages/editor-ui (Phase 5.4), the device view is ~169px and does not
 *     scroll
 *   - fetchDeviceTree() for live parameter targeting (Phase 5.1.3)
 * Those need framework capabilities from @m4l-jweb that are still open
 * questions in the plan (Phase 5.1), not just app code.
 *
 *   pnpm dev
 *
 * runs this in a browser with a mocked Live beside it: a transport, and a log
 * of every message crossing the bridge. No Live, no Max needed.
 */
import { useDevice } from "../shared/device";
import { Frame, Transport } from "../shared/Frame";

export default function App() {
  const device = useDevice();

  return (
    <Frame title="rack-editor" device={device}>
      <dt>status</dt>
      <dd>scaffold - bridge is alive, no editor wired in yet</dd>

      <Transport device={device} />
    </Frame>
  );
}
