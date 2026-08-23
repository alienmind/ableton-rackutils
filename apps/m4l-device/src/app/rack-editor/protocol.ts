/**
 * protocol.ts - every selector crossing this device's bridge.
 *
 * The single source of truth for both sides: the app binds/emits these, and the
 * generated patcher routes them. An unrouted selector produces no error at
 * runtime - the message just falls on the floor - so keep them here.
 *
 * `DEVICE_IN` is what the wrapper sends every device (mode, build, tick,
 * tempo). The `passthrough` chain in patcher/devices.mjs adds nothing of its
 * own - it is a wire, not a message source.
 */
import { DEVICE_IN } from "@m4l-jweb/bridge";

/** Device -> UI. */
export const IN = {
  ...DEVICE_IN,
} as const;

/** UI -> device. */
export const OUT = {
  /** UI -> wrapper: page ready; send me the current state. */
  ui_ready: "ui_ready",
} as const;
