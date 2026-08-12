import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { WebResource } from "@tokenring-ai/web-host/types.ts";
import type FeedbackService from "./FeedbackService.ts";
import { FEEDBACK_PATH_PREFIX } from "./FeedbackService.ts";

/** True if `target` is `root` itself or lives underneath it. */
function isInside(root: string, target: string): boolean {
  if (target === root) return true;
  const rel = path.relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function parseSessionPath(pathname: string): { sessionId: string; relative: string } | null {
  const prefix = `${FEEDBACK_PATH_PREFIX}/`;
  if (!pathname.startsWith(prefix)) return null;

  const rest = pathname.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) {
    if (!rest) return null;
    return { sessionId: rest, relative: "" };
  }

  return {
    sessionId: rest.slice(0, slash),
    relative: rest.slice(slash + 1),
  };
}

/**
 * Serves browser feedback UIs and collects accept/reject posts on the shared WebHost,
 * analogous to {@link GoogleOAuthCallbackResource}.
 */
export default class FeedbackResource implements WebResource {
  routes: NonNullable<WebResource["routes"]> = {};

  constructor(private readonly feedbackService: FeedbackService) {
    // Prefer the more specific result route over the static wildcard.
    this.routes[`${FEEDBACK_PATH_PREFIX}/:sessionId/result`] = async (request: Request) => {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
      }

      const url = new URL(request.url);
      const parsed = parseSessionPath(url.pathname);
      if (parsed?.relative !== "result") {
        return new Response("Not Found", { status: 404 });
      }

      const session = this.feedbackService.getSession(parsed.sessionId);
      if (!session) {
        return new Response("Session not found or already completed", { status: 404 });
      }

      let body: { accepted?: unknown; comment?: unknown };
      try {
        body = (await request.json()) as { accepted?: unknown; comment?: unknown };
      } catch {
        return new Response("Invalid JSON body", { status: 400 });
      }

      if (typeof body.accepted !== "boolean") {
        return new Response("Body must include boolean `accepted`", { status: 400 });
      }

      const comment = typeof body.comment === "string" ? body.comment : undefined;
      this.feedbackService.completeSession(parsed.sessionId, {
        accepted: body.accepted,
        comment,
      });

      return new Response("ok", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    };

    this.routes[`${FEEDBACK_PATH_PREFIX}/:sessionId/*`] = async (request: Request) => {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
      }

      const url = new URL(request.url);
      let pathname: string;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      if (pathname.includes("\0") || pathname.includes("\\")) {
        return new Response("Bad Request", { status: 400 });
      }

      const parsed = parseSessionPath(pathname);
      if (!parsed) {
        return new Response("Not Found", { status: 404 });
      }

      const session = this.feedbackService.getSession(parsed.sessionId);
      if (!session) {
        return new Response("Session not found or already completed", { status: 404 });
      }

      let relative = path.posix.normalize(parsed.relative || "index.html");
      if (relative.startsWith("../") || relative === "..") {
        return new Response("Forbidden", { status: 403 });
      }
      if (relative === "." || relative === "") {
        relative = "index.html";
      }

      // Resolve session root (follow macOS /tmp symlinks when possible).
      let rootDir = path.resolve(session.rootDir);
      try {
        rootDir = fsSync.realpathSync(rootDir);
      } catch {
        // keep resolved path
      }

      const fullPath = path.resolve(rootDir, relative);
      let realPath: string;
      try {
        realPath = await fs.realpath(fullPath);
      } catch {
        return new Response("Not Found", { status: 404 });
      }

      if (!isInside(rootDir, realPath)) {
        return new Response("Forbidden", { status: 403 });
      }

      const stats = await fs.stat(realPath);
      if (!stats.isFile()) {
        return new Response("Not Found", { status: 404 });
      }

      const file = Bun.file(realPath);
      if (request.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "Content-Length": String(stats.size),
          },
        });
      }

      return new Response(file, { status: 200 });
    };
  }
}
