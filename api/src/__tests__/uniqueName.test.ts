import { describe, it, expect, vi } from "vitest";
import { uniqueProjectName } from "../utils/uniqueName";
import type { PoolClient } from "pg";

function fakeClient(rows: { name: string }[]): PoolClient {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as PoolClient;
}

describe("uniqueProjectName", () => {
  it("returns baseName when no conflicts", async () => {
    const client = fakeClient([]);
    expect(await uniqueProjectName(client, "My Project")).toBe("My Project");
  });

  it("returns baseName (1) when baseName is taken", async () => {
    const client = fakeClient([{ name: "My Project" }]);
    expect(await uniqueProjectName(client, "My Project")).toBe("My Project (1)");
  });

  it("skips to (2) when both baseName and (1) are taken", async () => {
    const client = fakeClient([
      { name: "My Project" },
      { name: "My Project (1)" },
    ]);
    expect(await uniqueProjectName(client, "My Project")).toBe("My Project (2)");
  });

  it("finds first gap in non-sequential suffixes", async () => {
    const client = fakeClient([
      { name: "My Project" },
      { name: "My Project (1)" },
      { name: "My Project (3)" },
    ]);
    expect(await uniqueProjectName(client, "My Project")).toBe("My Project (2)");
  });

  it("ignores names with non-numeric suffix", async () => {
    const client = fakeClient([
      { name: "My Project" },
      { name: "My Project (abc)" },
    ]);
    expect(await uniqueProjectName(client, "My Project")).toBe("My Project (1)");
  });

  it("ignores names that only share a prefix", async () => {
    const client = fakeClient([{ name: "My Project Extra" }]);
    expect(await uniqueProjectName(client, "My Project")).toBe("My Project");
  });

  it("passes excludeId in query params when provided", async () => {
    const client = fakeClient([]);
    await uniqueProjectName(client, "Thesis", "some-uuid");
    const call = (client.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain("id <> $1");
    expect(call[1]).toContain("some-uuid");
  });

  it("does not use excludeId query when excludeId is absent", async () => {
    const client = fakeClient([]);
    await uniqueProjectName(client, "Thesis");
    const call = (client.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).not.toContain("id <> $1");
  });

  it("handles large suffix numbers", async () => {
    const taken = [{ name: "X" }];
    for (let i = 1; i <= 50; i++) taken.push({ name: `X (${i})` });
    const client = fakeClient(taken);
    expect(await uniqueProjectName(client, "X")).toBe("X (51)");
  });
});
