import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount React trees and clear the DOM after every test so renders don't leak
// across tests (which otherwise causes duplicate/zero element matches).
afterEach(() => cleanup());

// jsdom has no PointerEvent, so fireEvent.pointer* would drop clientX; charts need it.
if (typeof window !== "undefined" && !("PointerEvent" in window)) {
  class PointerEvent extends MouseEvent {
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerType = init.pointerType ?? "touch"; }
  }
  Object.assign(window, { PointerEvent });
}
