import { describe, expect, it } from "vitest";
import { isSafeDownloadUrl, parseGitHubUrl } from "./github";

describe("parseGitHubUrl", () => {
  it("parses a plain repo URL", () => {
    const r = parseGitHubUrl("https://github.com/owner/repo");
    expect(r).toEqual({ owner: "owner", repo: "repo", branch: "main", path: "" });
  });

  it("parses a tree URL with branch and path", () => {
    const r = parseGitHubUrl("https://github.com/owner/repo/tree/dev/src/lib");
    expect(r).toEqual({ owner: "owner", repo: "repo", branch: "dev", path: "src/lib" });
  });

  it("rejects non-github hosts", () => {
    expect(parseGitHubUrl("https://gitlab.com/owner/repo")).toBeNull();
    expect(parseGitHubUrl("https://raw.githubusercontent.com/owner/repo")).toBeNull();
    expect(parseGitHubUrl("https://evil.com/github.com/owner/repo")).toBeNull();
  });

  it("rejects URLs without owner/repo", () => {
    expect(parseGitHubUrl("https://github.com/")).toBeNull();
    expect(parseGitHubUrl("https://github.com/owner")).toBeNull();
  });

  it("rejects malformed URLs", () => {
    expect(parseGitHubUrl("not a url")).toBeNull();
    expect(parseGitHubUrl("")).toBeNull();
  });
});

describe("isSafeDownloadUrl (S-02 allowlist)", () => {
  it("accepts raw.githubusercontent.com", () => {
    expect(
      isSafeDownloadUrl("https://raw.githubusercontent.com/owner/repo/main/file.ts")
    ).toBe(true);
  });

  it("accepts api.github.com", () => {
    expect(
      isSafeDownloadUrl("https://api.github.com/repos/owner/repo/contents/file.ts")
    ).toBe(true);
  });

  it("rejects any other host", () => {
    expect(isSafeDownloadUrl("https://evil.com/file.ts")).toBe(false);
    expect(isSafeDownloadUrl("https://169.254.169.254/")).toBe(false);
    expect(isSafeDownloadUrl("https://localhost:8080/")).toBe(false);
    expect(isSafeDownloadUrl("https://github.com.evil.com/x")).toBe(false);
  });

  it("rejects non-http(s) schemes", () => {
    expect(isSafeDownloadUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeDownloadUrl("ftp://raw.githubusercontent.com/x")).toBe(false);
    expect(isSafeDownloadUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects empty / null / malformed", () => {
    expect(isSafeDownloadUrl(undefined)).toBe(false);
    expect(isSafeDownloadUrl("")).toBe(false);
    expect(isSafeDownloadUrl("not a url")).toBe(false);
  });
});
