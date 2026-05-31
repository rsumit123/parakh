import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount React trees and clear the DOM after every test so renders don't leak
// across tests (which otherwise causes duplicate/zero element matches).
afterEach(() => cleanup());
