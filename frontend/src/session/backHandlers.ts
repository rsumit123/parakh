import { useEffect, useRef } from "react";

// Android's Back button should close whatever is on top (a sheet, a photo viewer, a
// menu) before it leaves a screen. Open overlays register here, newest last.
const handlers: (() => void)[] = [];

/** While mounted (and `active`), Back calls `onBack` instead of navigating. */
export function useBackHandler(onBack: () => void, active = true): void {
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (!active) return;
    const h = () => latest.current();
    handlers.push(h);
    return () => {
      const i = handlers.lastIndexOf(h);
      if (i >= 0) handlers.splice(i, 1);
    };
  }, [active]);
}

/** Close the topmost overlay; false if nothing was open. */
export function handleBack(): boolean {
  const h = handlers[handlers.length - 1];
  if (!h) return false;
  h();
  return true;
}
