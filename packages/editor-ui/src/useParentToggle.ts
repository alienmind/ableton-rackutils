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
