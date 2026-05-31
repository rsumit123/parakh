import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { useBarcodeScanner, type ZxingReader } from "./useBarcodeScanner";

function makeFakeReader(textToEmit: string | null): ZxingReader {
  return {
    decodeFromVideoDevice: (_deviceId, _video, cb) => {
      if (textToEmit) cb({ getText: () => textToEmit }, undefined);
      return Promise.resolve({ stop: () => {} });
    },
  };
}

function Harness({ reader, onScan }: { reader: ZxingReader; onScan: (s: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { error } = useBarcodeScanner({ videoRef, enabled: true, onScan, makeReader: () => reader });
  return (
    <div>
      <video ref={videoRef} />
      <span data-testid="error">{error ?? "none"}</span>
    </div>
  );
}

describe("useBarcodeScanner", () => {
  it("invokes onScan with the decoded barcode text", async () => {
    const onScan = vi.fn();
    render(<Harness reader={makeFakeReader("8901058000177")} onScan={onScan} />);
    await waitFor(() => expect(onScan).toHaveBeenCalledWith("8901058000177"));
  });

  it("does not call onScan when nothing decodes", async () => {
    const onScan = vi.fn();
    render(<Harness reader={makeFakeReader(null)} onScan={onScan} />);
    // give effects a tick
    await new Promise((r) => setTimeout(r, 20));
    expect(onScan).not.toHaveBeenCalled();
    expect(screen.getByTestId("error").textContent).toBe("none");
  });
});
