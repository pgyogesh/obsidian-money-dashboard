// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isEditing } from "../src/render/common";

describe("isEditing", () => {
  it("is true only while a text input, select or textarea inside the block has focus", () => {
    const block = document.body.appendChild(document.createElement("div"));
    const input = block.appendChild(document.createElement("input"));
    const button = block.appendChild(document.createElement("button"));
    const outside = document.body.appendChild(document.createElement("input"));
    expect(isEditing(block, input)).toBe(true);
    expect(isEditing(block, button)).toBe(false);
    expect(isEditing(block, outside)).toBe(false);
    expect(isEditing(block, null)).toBe(false);
  });
});
