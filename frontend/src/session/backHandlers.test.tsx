import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { useBackHandler, handleBack } from "./backHandlers";

function Overlay({ onBack, active = true }: { onBack: () => void; active?: boolean }) {
  useBackHandler(onBack, active);
  return null;
}

describe("Android Back closes the top overlay first", () => {
  it("calls the newest open overlay, and nothing once they're gone", () => {
    const sheet = vi.fn(), photo = vi.fn();
    const { rerender, unmount } = render(<><Overlay onBack={sheet} /><Overlay onBack={photo} /></>);
    expect(handleBack()).toBe(true);
    expect(photo).toHaveBeenCalledOnce();      // the photo viewer opened last, closes first
    rerender(<><Overlay onBack={sheet} /><Overlay onBack={photo} active={false} /></>);
    handleBack();
    expect(sheet).toHaveBeenCalledOnce();
    unmount();
    expect(handleBack()).toBe(false);          // nothing open: navigation handles Back
  });
});
