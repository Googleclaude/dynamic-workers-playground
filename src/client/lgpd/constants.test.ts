import { describe, expect, it } from "vitest";
import { hasValidControllerInfo } from "./constants";

describe("hasValidControllerInfo (L-05 placeholder guard)", () => {
  it("returns false for the default placeholders", () => {
    // The repo ships with bracketed placeholders so deployers can't
    // accidentally publish a non-functional rights channel.
    expect(hasValidControllerInfo()).toBe(false);
  });

  // The remaining behaviour is structurally tested: looksLikePlaceholder is
  // not exported, but `hasValidControllerInfo` would return `true` after a
  // deployer replaces every bracketed value and the example.com emails.
  // That path is verified end-to-end in DataRightsForm rendering tests.
});
