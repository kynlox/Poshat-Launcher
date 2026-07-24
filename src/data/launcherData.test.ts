import { describe, it, expect } from "vitest";
import { sections, loaderOptions, settingsGroups } from "@/data/launcherData";

describe("sections", () => {
  it("has required section ids", () => {
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("home");
    expect(ids).toContain("instances");
    expect(ids).toContain("modsCatalog");
    expect(ids).toContain("accounts");
    expect(ids).toContain("settings");
  });

  it("each section has label and icon", () => {
    for (const s of sections) {
      expect(s.label).toBeTruthy();
      expect(s.icon).toBeTruthy();
    }
  });

  it("no duplicate ids", () => {
    const ids = sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("loaderOptions", () => {
  it("includes standard loaders", () => {
    const ids = loaderOptions.map((l) => l.id);
    expect(ids).toContain("vanilla");
    expect(ids).toContain("fabric");
    expect(ids).toContain("forge");
    expect(ids).toContain("quilt");
    expect(ids).toContain("neoforge");
  });

  it("each option has id and label", () => {
    for (const opt of loaderOptions) {
      expect(opt.id).toBeTruthy();
      expect(opt.label).toBeTruthy();
    }
  });
});

describe("settingsGroups", () => {
  it("has groups with titles", () => {
    expect(settingsGroups.length).toBeGreaterThan(0);
    for (const g of settingsGroups) {
      expect(g.title).toBeTruthy();
      expect(g.rows.length).toBeGreaterThan(0);
    }
  });

  it("each row has label and icon", () => {
    for (const g of settingsGroups) {
      for (const row of g.rows) {
        expect(row.label).toBeTruthy();
        expect(row.icon).toBeTruthy();
      }
    }
  });

  it("memory setting has correct range", () => {
    const perf = settingsGroups.find((g) => g.title === "Производительность");
    const mem = perf?.rows.find((r) => r.settingKey === "javaMemoryGb");
    expect(mem).toBeDefined();
    expect(mem?.min).toBe(1);
    expect(mem?.max).toBeGreaterThanOrEqual(8);
  });
});
