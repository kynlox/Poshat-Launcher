import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAnimations } from "@/utils/useAnimations";

describe("useAnimations", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.animations;
  });

  it("defaults to enabled", () => {
    const { result } = renderHook(() => useAnimations());
    expect(result.current.enabled).toBe(true);
  });

  it("reads false from localStorage", () => {
    localStorage.setItem("poshat-animations", "false");
    const { result } = renderHook(() => useAnimations());
    expect(result.current.enabled).toBe(false);
  });

  it("toggle flips state", () => {
    const { result } = renderHook(() => useAnimations());
    expect(result.current.enabled).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(true);
  });

  it("setEnabled sets explicit value", () => {
    const { result } = renderHook(() => useAnimations());
    act(() => result.current.setEnabled(false));
    expect(result.current.enabled).toBe(false);

    act(() => result.current.setEnabled(true));
    expect(result.current.enabled).toBe(true);
  });

  it("persists to localStorage", () => {
    const { result } = renderHook(() => useAnimations());
    act(() => result.current.toggle());
    expect(localStorage.getItem("poshat-animations")).toBe("false");
  });

  it("sets data-animations attribute on document", () => {
    renderHook(() => useAnimations());
    expect(document.documentElement.dataset.animations).toBe("enabled");
  });
});
