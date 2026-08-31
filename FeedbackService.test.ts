import { describe, expect, it } from "bun:test";
import FeedbackService from "./FeedbackService.ts";

describe("FeedbackService", () => {
  it("resolves a session when completed", async () => {
    const service = new FeedbackService();
    const session = service.createSession("/tmp/fake", { timeoutMs: 0 });
    expect(service.completeSession(session.id, { accepted: true, comment: "ok" })).toBe(true);
    await expect(session.promise).resolves.toEqual({ accepted: true, comment: "ok" });
    service.removeSession(session.id);
  });

  it("rejects on timeout", async () => {
    const service = new FeedbackService();
    const session = service.createSession("/tmp/fake", { timeoutMs: 20 });
    await expect(session.promise).rejects.toThrow(/timeout/i);
    expect(service.getSession(session.id)).toBeUndefined();
  });

  it("rejects pending waiters when removed", async () => {
    const service = new FeedbackService();
    const session = service.createSession("/tmp/fake", { timeoutMs: 0 });
    const wait = session.promise;
    service.removeSession(session.id);
    await expect(wait).rejects.toThrow(/cancelled/i);
  });

  it("ignores double-complete after settle", async () => {
    const service = new FeedbackService();
    const session = service.createSession("/tmp/fake", { timeoutMs: 0 });
    expect(service.completeSession(session.id, { accepted: false })).toBe(true);
    expect(service.completeSession(session.id, { accepted: true })).toBe(false);
    await expect(session.promise).resolves.toEqual({ accepted: false });
    service.removeSession(session.id);
  });

  it("returns false when completing a timed-out session", async () => {
    const service = new FeedbackService();
    const session = service.createSession("/tmp/fake", { timeoutMs: 20 });
    await expect(session.promise).rejects.toThrow(/timeout/i);
    expect(service.completeSession(session.id, { accepted: true })).toBe(false);
  });
});
