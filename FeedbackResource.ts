import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { WebResource } from "@tokenring-ai/web-host/types";
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
 * Files a tool wrote (the content under review) run sandboxed: an opaque origin, even when opened
 * directly, so their scripts cannot use the app's session, open its RPC socket, or post the review.
 */
const CONTENT_HEADERS = {
  "Content-Security-Policy": "sandbox allow-scripts allow-modals allow-popups allow-forms",
  "X-Content-Type-Options": "nosniff",
};

/** The review page itself: the trusted Accept/Reject bar, with the content in a sandboxed frame. */
function reviewPage(nonce: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>Review</title>
    <style>
      html, body { margin: 0; height: 100%; font-family: sans-serif; }
      body { display: flex; flex-direction: column; }
      #bar { display: flex; gap: 8px; padding: 8px; background: #f0f0f0; align-items: flex-start; border-bottom: 1px solid #ccc; }
      #bar button { padding: 6px 12px; border: 0; border-radius: 4px; cursor: pointer; color: white; }
      #accept { background: #2e8b57; }
      #reject { background: #c0392b; }
      #comment { flex: 1; min-height: 3lh; padding: 6px; }
      iframe { flex: 1; border: 0; width: 100%; }
    </style>
  </head>
  <body>
    <div id="bar">
      <button type="button" id="accept">Accept</button>
      <button type="button" id="reject">Reject</button>
      <textarea id="comment" placeholder="Enter your comments here..."></textarea>
    </div>
    <iframe src="./content.html" sandbox="allow-scripts allow-modals allow-popups allow-forms" title="Content under review"></iframe>
    <script nonce="${nonce}">
      function submit(accepted) {
        fetch("./result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accepted: accepted, comment: document.getElementById("comment").value }),
        }).then(function (response) {
          document.body.textContent = response.ok ? "Feedback submitted. You can close this window." : "Failed to submit feedback.";
        }, function (error) {
          document.body.textContent = "Error submitting feedback: " + error;
        });
      }
      document.getElementById("accept").addEventListener("click", function () { submit(true); });
      document.getElementById("reject").addEventListener("click", function () { submit(false); });
    </script>
  </body>
</html>`;
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
      const completed = this.feedbackService.completeSession(parsed.sessionId, {
        accepted: body.accepted,
        comment,
      });
      if (!completed) {
        return new Response("Session already completed or timed out", { status: 409 });
      }

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

      // The review page is always this one, never a file the tool wrote: the content is shown in
      // its sandboxed frame (content.html).
      if (relative === "index.html") {
        const nonce = crypto.randomUUID().replaceAll("-", "");
        return new Response(request.method === "HEAD" ? null : reviewPage(nonce), {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; frame-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'`,
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
          },
        });
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
            ...CONTENT_HEADERS,
            "Content-Type": file.type || "application/octet-stream",
            "Content-Length": String(stats.size),
          },
        });
      }

      return new Response(file, { status: 200, headers: { ...CONTENT_HEADERS, "Content-Type": file.type || "application/octet-stream" } });
    };
  }
}
