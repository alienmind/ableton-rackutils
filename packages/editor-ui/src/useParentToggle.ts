import { useEffect, useRef, useState } from 'react';

/**
 * Local open/closed state that a parent can drive, without the parent's
 * initial value stamping over the local default.
 *
 * The rack's "collapse the devices" button has to reach every device, but
 * devices and nested racks start collapsed on their own. A plain
 * `useEffect(() => set(fromParent), [fromParent])` runs on mount too, so the
 * parent's `false` immediately overrode the local `true` and everything opened
 * itself. This reacts to CHANGES only: the first render keeps the default.
 */
export function useParentToggle(initial: boolean, fromParent: boolean | undefined): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(initial);
  const previous = useRef(fromParent);

  useEffect(() => {
    if (previous.current === fromParent) return;
    previous.current = fromParent;
    if (fromParent !== undefined) setValue(fromParent);
  }, [fromParent]);

  return [value, setValue];
}

/**
 * "Folded because the row has no room", which is not the same as "closed".
 *
 * The width budget (`RackEditor`) is a view over what the user asked for, not
 * a change to it: a device the user opened is drawn as a strip while the
 * window is too narrow and comes back when it is not. Feeding the budget into
 * the state instead flipped things OPEN that start closed by design - every
 * nested rack unfolded itself the moment the first measurement arrived.
 *
 * Clicking a strip still opens it even when the row is tight, because the user
 * asking for it beats an estimate; the next change of budget takes over again.
 */
export function useBudgetedCollapse(closed: boolean, overBudget: boolean): [boolean, (value: boolean) => void] {
  const [override, setOverride] = useState(false);
  const previous = useRef(overBudget);

  useEffect(() => {
    if (previous.current === overBudget) return;
    previous.current = overBudget;
    setOverride(false);
  }, [overBudget]);

  return [closed || (overBudget && !override), (value: boolean) => setOverride(!value)];
}
