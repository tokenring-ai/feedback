import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { FileSystemService } from "@tokenring-ai/filesystem";
import WebHostService from "@tokenring-ai/web-host/WebHostService";
import { marked } from "marked";
import open from "open";
import { z } from "zod";
import FeedbackService from "../FeedbackService.ts";
import { toRejectedFilePath } from "../rejectedFilePath.ts";

// Tool name export as required
const name = "feedback_getFileFeedback";
const displayName = "Feedback/getFileFeedback";

const TMP_PREFIX = "file-feedback-";

const description =
  "This tool allows you to present the content of a file to the user, solicit feedback (accept/reject with comments), and optionally write the content to a specified file path if accepted. If the `contentType` is `text/markdown` or `text/x-markdown`, the content will be rendered as HTML for review.";

const inputSchema = z
  .object({
    filePath: z.string().min(1).describe("The path where the file content should be saved if accepted."),
    content: z.string().min(1).describe("The actual text content to be reviewed."),
    contentType: z
      .string()
      .describe(
        "Optional. The MIME type of the content (e.g., 'text/plain', 'text/html', 'application/json', 'text/markdown', 'text/x-markdown'). Defaults to 'text/plain'. If 'text/markdown' or 'text/x-markdown', content is rendered as HTML for review. Used for browser rendering.",
      )
      .default("text/plain"),
  })
  .strict();

export interface GetFileFeedbackResult {
  status: "accepted" | "rejected";
  comment?: string | undefined;
  filePath?: string | undefined;
  rejectedFilePath?: string | undefined;
}

async function execute({ filePath, content, contentType }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const fileSystem = agent.requireService(FileSystemService);
  const feedbackService = agent.requireService(FeedbackService);
  const webHostService = agent.requireService(WebHostService);

  // 1. Create a temp workspace
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX));
  let sessionId: string | undefined;

  try {
    // 2. The content page; FeedbackResource serves the review page around it (in a sandboxed frame).
    await fs.writeFile(path.join(tmpDir, "content.html"), genFileViewHTML({ contentString: content, contentType }), "utf8");

    // 3. Register session only after files are ready (avoids hanging waiters on setup failure)
    const session = feedbackService.createSession(tmpDir);
    sessionId = session.id;

    const url = feedbackService.getSessionUrl(session.id, webHostService);
    try {
      await open(url);
      agent.infoMessage(`[${name}] File review UI opened at: ${url}`);
    } catch {
      agent.infoMessage(`[${name}] File review UI available at: ${url} (open command mocked/unavailable)`);
    }

    let result: { accepted: boolean; comment?: string | undefined };
    try {
      result = await session.promise;
    } catch (error) {
      throw new ToolCallError(name, error instanceof Error ? error.message : String(error));
    }

    agent.infoMessage(`[${name}] Feedback received: ${result.accepted ? "Accepted" : "Rejected"}${result.comment ? " with comment: " + result.comment : ""}`);

    // 4. If accepted ➜ copy into repo
    if (result.accepted) {
      await fileSystem.writeFile(filePath, content, agent);
      agent.infoMessage(`[${name}] Feedback accepted. Content written to ${filePath}`);
      return {
        message: `**Asked** For feedback`,
        result: JSON.stringify({
          status: "accepted",
          comment: result.comment,
          filePath,
        } satisfies GetFileFeedbackResult),
      };
    }

    const rejectFile = toRejectedFilePath(filePath);
    await fileSystem.writeFile(rejectFile, content, agent);
    agent.infoMessage(`[${name}] Feedback rejected. Content written to ${rejectFile}`);

    return {
      message: `**Asked** For feedback`,
      result: JSON.stringify({
        status: "rejected",
        comment: result.comment,
        rejectedFilePath: rejectFile,
      } satisfies GetFileFeedbackResult),
    };
  } finally {
    if (sessionId) {
      feedbackService.removeSession(sessionId);
    }
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (err) {
      agent.warningMessage(`[${name}] Error cleaning up temporary directory ${tmpDir}`, err as Error);
    }
  }
}

function escapeHTML(str: string) {
  const map: Record<"&" | "<" | ">" | '"' | "'", string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return str.replace(/[&<>"']/g, (match: string) => map[match as keyof typeof map]);
}

/**
 * The page shown in the review frame. FeedbackResource serves it sandboxed (no access to the app's
 * origin), so markdown's raw HTML and an HTML document's scripts cannot act as the user.
 */
export function genFileViewHTML({ contentString, contentType }: { contentString: string; contentType: string }): string {
  // An HTML document is shown as itself.
  if (contentType === "text/html") return contentString;

  let displayContentHtml: string;
  let effectiveContentType = contentType;
  if (contentType === "text/markdown" || contentType === "text/x-markdown") {
    // marked types include Promise, but `{ async: false }` returns a string synchronously.
    const parsed = marked.parse(contentString, { async: false });
    if (typeof parsed !== "string") {
      throw new Error("Expected synchronous markdown parse result");
    }
    displayContentHtml = `<div class="markdown-body">${parsed}</div>`;
  } else {
    if (contentType !== "application/json") effectiveContentType = "text/plain";
    displayContentHtml = `<pre>${escapeHTML(contentString)}</pre>`;
  }

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>File Content Review</title>
    <style>
      body { font-family: sans-serif; padding: 10px; }
      pre { white-space: pre-wrap; word-wrap: break-word; }
      .markdown-body code { background-color: #f0f0f0; padding: 0.2em 0.4em; border-radius: 3px; }
      .markdown-body pre code { display: block; padding: 0.5em; }
    </style>
  </head>
  <body>
    <h3>Reviewing content (${escapeHTML(effectiveContentType)})</h3>
    ${displayContentHtml}
  </body>
</html>`;
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
