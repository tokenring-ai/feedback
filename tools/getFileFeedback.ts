import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { FileSystemService } from "@tokenring-ai/filesystem";
import { marked } from "marked";
import open from "open";
import { z } from "zod";
import WebHostService from "@tokenring-ai/web-host/WebHostService";
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
    // Define user content file name for text/html scenario
    const userContentFileName = "user_content.html";

    // If contentType is text/html, write the content to user_content.html
    if (contentType === "text/html") {
      await fs.writeFile(path.join(tmpDir, userContentFileName), content, "utf8");
    }

    // 2. Make an index.html file for the review UI
    const indexHtmlContent = genFileViewHTML({
      contentString: content,
      contentType,
      htmlContentPath: contentType === "text/html" ? `./${userContentFileName}` : undefined,
    });
    await fs.writeFile(path.join(tmpDir, "index.html"), indexHtmlContent, "utf8");

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

function genFileViewHTML({
  contentString,
  contentType,
  htmlContentPath,
}: {
  contentString: string;
  contentType: string;
  htmlContentPath?: string | undefined;
}) {
  let displayContentHtml: string;
  let effectiveContentType = contentType;

  if (contentType === "text/markdown" || contentType === "text/x-markdown") {
    // marked types include Promise, but `{ async: false }` returns a string synchronously.
    const parsed = marked.parse(contentString, { async: false });
    if (typeof parsed !== "string") {
      throw new Error("Expected synchronous markdown parse result");
    }
    displayContentHtml = `<div class="markdown-body" style="padding:10px; border:1px solid #ccc; min-height:50vh;">${parsed}</div>`;
  } else if (contentType === "text/html") {
    displayContentHtml = `<iframe src="${escapeHTML(htmlContentPath ?? "")}" style="width:100%; height:80vh; border:1px solid #ccc;"></iframe>`;
  } else if (contentType === "application/json") {
    displayContentHtml = `<pre style="white-space: pre-wrap; word-wrap: break-word; border:1px solid #ccc; padding:10px; min-height:50vh;">${escapeHTML(contentString)}</pre>`;
  } else {
    effectiveContentType = "text/plain";
    displayContentHtml = `<pre style="white-space: pre-wrap; word-wrap: break-word; border:1px solid #ccc; padding:10px; min-height:50vh;">${escapeHTML(contentString)}</pre>`;
  }

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>File Content Review</title>
    <style>
      .markdown-body h1, .markdown-body h2, .markdown-body h3 { margin-top: 1em; margin-bottom: 0.5em; }
      .markdown-body p { margin-bottom: 0.5em; }
      .markdown-body ul, .markdown-body ol { margin-bottom: 0.5em; padding-left: 2em; }
      .markdown-body code { background-color: #f0f0f0; padding: 0.2em 0.4em; border-radius: 3px; }
      .markdown-body pre code { display: block; padding: 0.5em; background-color: #f0f0f0; border-radius: 3px; }
    </style>
    <style>
      body{margin-top: 100px; font-family:sans-serif; padding: 10px;}
      #feedback-bar{position:fixed;top:0;left:0;right:0;display:flex;gap:8px;padding:8px;background:#eee;z-index:999; border-bottom: 1px solid #ccc; align-items: center;}
      #feedback-bar button{padding:8px 15px;border:0;border-radius:4px;cursor:pointer; font-size: 14px;}
      #feedback-bar #acceptBtn{background:#77dd77;}
      #feedback-bar #rejectBtn{background:#ff6961;}
      #feedback-bar textarea{flex-grow:1; min-height: 50px; padding:6px; border-radius:4px; border: 1px solid #ccc; margin: 0 8px;}
      #content-display{margin-top:20px;}
    </style>
  </head>
  <body>
    <div id="feedback-bar">
      <button type="button" id="acceptBtn">Accept</button>
      <button type="button" id="rejectBtn">Reject</button>
      <textarea id="commentBox" placeholder="Enter your comments here..."></textarea>
    </div>
    <div id="content-display">
      <h3>Reviewing Content (Type: ${escapeHTML(effectiveContentType)})</h3>
      ${displayContentHtml}
    </div>
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        const acceptBtn = document.getElementById('acceptBtn');
        const rejectBtn = document.getElementById('rejectBtn');

        const submitFeedback = (accepted) => (e) => {
         e.preventDefault();
         const comment = document.getElementById('commentBox').value;
         // Relative to /feedback/:sessionId/index.html → /feedback/:sessionId/result
         fetch('./result', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ accepted: accepted, comment: comment })
         }).then(response => {
            if(response.ok) {
              alert("Feedback submitted! You can close this window.");
              document.body.innerHTML = "<h1>Feedback submitted. You can close this window.</h1>";
            } else {
              alert("Failed to submit feedback.");
            }
         }).catch(err => alert("Error submitting feedback: " + err));
        };

        acceptBtn.addEventListener('click', submitFeedback(true));
        rejectBtn.addEventListener('click', submitFeedback(false));
      });
    </script>
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
