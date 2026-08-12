import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import FeedbackResource from "./FeedbackResource.ts";
import FeedbackService, { FEEDBACK_PATH_PREFIX } from "./FeedbackService.ts";

type RouteHandler = (request: Request) => Response | Promise<Response>;

function getRouteHandler(resource: FeedbackResource, route: string): RouteHandler {
  const handler = resource.routes[route];
  if (typeof handler !== "function") {
    throw new Error(`Expected function route handler for ${route}`);
  }
  return handler as RouteHandler;
}

describe("FeedbackResource", () => {
  let feedbackService: FeedbackService;
  let resource: FeedbackResource;
  let tmpDir: string;
  let sessionId: string;

  beforeEach(async () => {
    feedbackService = new FeedbackService();
    resource = new FeedbackResource(feedbackService);
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "feedback-test-"));
    await fs.writeFile(path.join(tmpDir, "index.html"), "<html>ok</html>", "utf8");
    const session = feedbackService.createSession(tmpDir, { timeoutMs: 0 });
    sessionId = session.id;
  });

  afterEach(async () => {
    feedbackService.removeSession(sessionId);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("serves session static files", async () => {
    const handler = getRouteHandler(resource, `${FEEDBACK_PATH_PREFIX}/:sessionId/*`);

    const request = new Request(`http://127.0.0.1${FEEDBACK_PATH_PREFIX}/${sessionId}/index.html`);
    const response = await handler(request);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("ok");
  });

  it("rejects path traversal", async () => {
    const handler = getRouteHandler(resource, `${FEEDBACK_PATH_PREFIX}/:sessionId/*`);
    const request = new Request(`http://127.0.0.1${FEEDBACK_PATH_PREFIX}/${sessionId}/../../etc/passwd`);
    const response = await handler(request);
    expect([403, 404]).toContain(response.status);
  });

  it("completes a session on POST /result", async () => {
    const session = feedbackService.getSession(sessionId)!;
    const handler = getRouteHandler(resource, `${FEEDBACK_PATH_PREFIX}/:sessionId/result`);

    const request = new Request(`http://127.0.0.1${FEEDBACK_PATH_PREFIX}/${sessionId}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepted: true, comment: "looks good" }),
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");

    const result = await session.promise;
    expect(result).toEqual({ accepted: true, comment: "looks good" });
  });

  it("returns 404 for unknown sessions", async () => {
    const handler = getRouteHandler(resource, `${FEEDBACK_PATH_PREFIX}/:sessionId/result`);
    const request = new Request(`http://127.0.0.1${FEEDBACK_PATH_PREFIX}/missing-id/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepted: false }),
    });
    const response = await handler(request);
    expect(response.status).toBe(404);
  });
});
