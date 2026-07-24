import { describe, it, expect } from "vitest";
import { getAccountHeadUrl, handleAccountHeadError } from "@/utils/accountHead";

describe("getAccountHeadUrl", () => {
  it("returns null for null account", () => {
    expect(getAccountHeadUrl(null)).toBeNull();
  });

  it("returns null for undefined account", () => {
    expect(getAccountHeadUrl(undefined)).toBeNull();
  });

  it("prefers avatarUrl when provided", () => {
    const account = { avatarUrl: "https://example.com/avatar.png", uuid: "abc" };
    expect(getAccountHeadUrl(account)).toBe("https://example.com/avatar.png");
  });

  it("falls back to mc-heads.net with UUID", () => {
    const account = { uuid: "550e8400-e29b-41d4-a716-446655440000" };
    const url = getAccountHeadUrl(account);
    expect(url).toContain("mc-heads.net/avatar/");
    expect(url).toContain("64");
  });

  it("uses name when UUID is missing", () => {
    const account = { name: "Steve" };
    const url = getAccountHeadUrl(account);
    expect(url).toContain("mc-heads.net/avatar/");
  });

  it("strips dashes from UUID in URL path", () => {
    const account = { uuid: "550e8400-e29b-41d4-a716-446655440000" };
    const url = getAccountHeadUrl(account);
    // The URL path segment should not contain UUID dashes
    const pathPart = new URL(url).pathname;
    const uuidSegment = pathPart.split("/")[2]; // /avatar/<uuid>/64
    expect(uuidSegment).not.toContain("-");
  });

  it("encodes special characters in UUID", () => {
    const account = { uuid: "test+user/123" };
    const url = getAccountHeadUrl(account);
    expect(url).toContain(encodeURIComponent("test+user/123"));
  });
});

describe("handleAccountHeadError", () => {
  it("falls back to next source on error", () => {
    const account = { uuid: "550e8400-e29b-41d4-a716-446655440000" };
    const image = {
      dataset: { headSourceIndex: "0" },
      src: "",
    };
    handleAccountHeadError({ currentTarget: image }, account);
    expect(image.dataset.headSourceIndex).toBe("1");
    expect(image.src).toBeTruthy();
  });

  it("hides image when no more sources", () => {
    const account = { uuid: "550e8400-e29b-41d4-a716-446655440000" };
    const image = {
      dataset: { headSourceIndex: "3" },
      src: "",
      style: { display: "block" },
    };
    handleAccountHeadError({ currentTarget: image }, account);
    expect(image.style.display).toBe("none");
  });
});
