import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// O jsdom não implementa ResizeObserver, usado pelo posicionamento dos tooltips do Radix.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub;

afterEach(() => {
  if (typeof document !== "undefined") cleanup();
});
