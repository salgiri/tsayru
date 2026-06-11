import { describe, it, expect } from "vitest";
import { resolveProjectByHost } from "../server/lib/project.js";

// The lsof happy path is machine-dependent; these tests pin the guard rails —
// anything non-local or malformed must resolve to null (= global batch).
describe("resolveProjectByHost", () => {
  it("returns null for public hosts", async () => {
    expect(await resolveProjectByHost("example.com")).toBeNull();
    expect(await resolveProjectByHost("evil.com:5173")).toBeNull();
    expect(await resolveProjectByHost("myapp.test:3000")).toBeNull();
  });

  it("returns null for garbage input", async () => {
    expect(await resolveProjectByHost(null)).toBeNull();
    expect(await resolveProjectByHost("")).toBeNull();
    expect(await resolveProjectByHost("not a host !!")).toBeNull();
    expect(await resolveProjectByHost("localhost:notaport")).toBeNull();
  });

  it("returns null for a localhost port nobody listens on", async () => {
    // Port 1 is reserved and never has a dev server on it.
    expect(await resolveProjectByHost("127.0.0.1:1")).toBeNull();
  });
});
