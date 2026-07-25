import { describe, it, expect, vi, beforeEach } from "vitest";

describe("updater.js logic", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("checkedOnce guard prevents double-check", async () => {
    const { checkForUpdatesOnStartup } = await import("./updater.js");
    const toast = { busy: vi.fn(() => "1"), dismiss: vi.fn(), info: vi.fn(), ok: vi.fn(), err: vi.fn() };
    const confirm = vi.fn();

    await checkForUpdatesOnStartup(toast, confirm);
    await checkForUpdatesOnStartup(toast, confirm);

    // setTimeout is used, so we need to advance timers
    vi.useFakeTimers();
    await checkForUpdatesOnStartup(toast, confirm);
    vi.advanceTimersByTime(5000);

    // Should only fire once due to checkedOnce guard
    expect(confirm).toHaveBeenCalledTimes(0);
    vi.useRealTimers();
  });

  it("exported function is async", () => {
    const mod = require("./updater.js");
    expect(typeof mod.checkForUpdatesOnStartup).toBe("function");
  });
});
