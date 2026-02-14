import { describe, it, expect } from "vitest";
import { greet } from "./index.js";

describe("greet", () => {
  it("returns a greeting with the given name", () => {
    expect(greet("World")).toBe("Hello, World!");
  });
});
