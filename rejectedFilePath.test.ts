import { describe, expect, it } from "bun:test";
import { toRejectedFilePath } from "./rejectedFilePath.ts";

describe("toRejectedFilePath", () => {
  // Local wall-clock components so date-fns format() is timezone-stable in tests.
  const now = new Date(2024, 0, 15, 14, 30, 22);

  it("inserts stamp before a single extension", () => {
    expect(toRejectedFilePath("docs/sample.md", now)).toBe("docs/sample.rejected20240115-143022.md");
  });

  it("uses the final extension for multi-dot names", () => {
    expect(toRejectedFilePath("my.component.tsx", now)).toBe("my.component.rejected20240115-143022.tsx");
  });

  it("appends stamp when there is no extension", () => {
    expect(toRejectedFilePath("README", now)).toBe("README.rejected20240115-143022");
  });

  it("does not include colons (Windows-safe)", () => {
    const result = toRejectedFilePath("app.test.tsx", now);
    expect(result).not.toContain(":");
    expect(result).toBe("app.test.rejected20240115-143022.tsx");
  });
});
