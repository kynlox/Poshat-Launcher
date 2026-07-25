import { describe, it, expect } from "vitest";
import { poshatAPI } from "./poshatAPI";

describe("poshatAPI structure", () => {
  it("has app namespace", () => {
    expect(poshatAPI.app).toBeDefined();
    expect(typeof poshatAPI.app.startupInstance).toBe("function");
    expect(typeof poshatAPI.app.hide).toBe("function");
    expect(typeof poshatAPI.app.showMain).toBe("function");
    expect(typeof poshatAPI.app.exit).toBe("function");
  });

  it("has settings namespace", () => {
    expect(poshatAPI.settings).toBeDefined();
    expect(typeof poshatAPI.settings.get).toBe("function");
    expect(typeof poshatAPI.settings.set).toBe("function");
  });

  it("has roots namespace", () => {
    expect(poshatAPI.roots).toBeDefined();
    expect(typeof poshatAPI.roots.get).toBe("function");
  });

  it("has lastSelection namespace", () => {
    expect(poshatAPI.lastSelection).toBeDefined();
    expect(typeof poshatAPI.lastSelection.get).toBe("function");
    expect(typeof poshatAPI.lastSelection.set).toBe("function");
  });

  it("has offlineNickname namespace", () => {
    expect(poshatAPI.offlineNickname).toBeDefined();
    expect(typeof poshatAPI.offlineNickname.get).toBe("function");
    expect(typeof poshatAPI.offlineNickname.set).toBe("function");
  });

  it("has accounts namespace", () => {
    expect(poshatAPI.accounts).toBeDefined();
    expect(typeof poshatAPI.accounts.list).toBe("function");
    expect(typeof poshatAPI.accounts.active).toBe("function");
    expect(typeof poshatAPI.accounts.addOffline).toBe("function");
    expect(typeof poshatAPI.accounts.setActive).toBe("function");
    expect(typeof poshatAPI.accounts.remove).toBe("function");
  });

  it("has instances namespace", () => {
    expect(poshatAPI.instances).toBeDefined();
    expect(typeof poshatAPI.instances.list).toBe("function");
    expect(typeof poshatAPI.instances.create).toBe("function");
    expect(typeof poshatAPI.instances.delete).toBe("function");
    expect(typeof poshatAPI.instances.exportPack).toBe("function");
    expect(typeof poshatAPI.instances.importPack).toBe("function");
    expect(typeof poshatAPI.instances.setIcon).toBe("function");
    expect(typeof poshatAPI.instances.diskSize).toBe("function");
    expect(typeof poshatAPI.instances.togglePin).toBe("function");
  });

  it("has install namespace", () => {
    expect(poshatAPI.install).toBeDefined();
    expect(typeof poshatAPI.install.run).toBe("function");
    expect(typeof poshatAPI.install.cancel).toBe("function");
  });

  it("has launch namespace", () => {
    expect(poshatAPI.launch).toBeDefined();
    expect(typeof poshatAPI.launch.run).toBe("function");
    expect(typeof poshatAPI.launch.kill).toBe("function");
  });

  it("has catalog namespace", () => {
    expect(poshatAPI.catalog).toBeDefined();
    expect(typeof poshatAPI.catalog.search).toBe("function");
    expect(typeof poshatAPI.catalog.project).toBe("function");
    expect(typeof poshatAPI.catalog.versions).toBe("function");
    expect(typeof poshatAPI.catalog.checkUpdates).toBe("function");
    expect(typeof poshatAPI.catalog.updateMod).toBe("function");
    expect(typeof poshatAPI.catalog.install).toBe("function");
    expect(typeof poshatAPI.catalog.remove).toBe("function");
  });

  it("has loaders namespace", () => {
    expect(poshatAPI.loaders).toBeDefined();
    expect(typeof poshatAPI.loaders.list).toBe("function");
  });

  it("has versions namespace", () => {
    expect(poshatAPI.versions).toBeDefined();
    expect(typeof poshatAPI.versions.list).toBe("function");
    expect(typeof poshatAPI.versions.latest).toBe("function");
    expect(typeof poshatAPI.versions.refresh).toBe("function");
    expect(typeof poshatAPI.versions.installed).toBe("function");
  });

  it("has system namespace", () => {
    expect(poshatAPI.system).toBeDefined();
    expect(typeof poshatAPI.system.openRootFolder).toBe("function");
    expect(typeof poshatAPI.system.clearSharedCache).toBe("function");
  });

  it("has on() event listener", () => {
    expect(typeof poshatAPI.on).toBe("function");
  });

  it("has all required top-level namespaces", () => {
    const required = [
      "app", "settings", "roots", "lastSelection", "offlineNickname",
      "accounts", "instances", "install", "launch", "catalog", "loaders",
      "versions", "system", "on",
    ];
    for (const ns of required) {
      expect(poshatAPI).toHaveProperty(ns);
    }
  });
});
