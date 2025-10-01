import Agent from "@tokenring-ai/agent/Agent";
import {FileSystemService} from "@tokenring-ai/filesystem";
import express, {type Request, type Response} from "express";
import {marked} from "marked";
import { format } from "date-fns";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import open from "open";
import {z} from "zod";

// Tool name export as required
export const name = "feedback/getFileFeedback";

const TMP_PREFIX = "file-feedback-";

export const description =
  "This tool allows you to present the content of a file to the user, solicit feedback (accept/reject with comments), and optionally write the content to a specified file path if accepted. If the `contentType` is `text/markdown` or `text/x-markdown`, the content will be rendered as HTML for review.";

export const inputSchema = z
  .object({
    filePath: z
      .string()
      .describe("The path where the file content should be saved if accepted."),
    content: z.string().describe("The actual text content to be reviewed."),
    contentType: z
      .string()
      .describe(
        "Optional. The MIME type of the content (e.g., 'text/plain', 'text/html', 'application/json', 'text/markdown', 'text/x-markdown'). Defaults to 'text/plain'. If 'text/markdown' or 'text/x-markdown', content is rendered as HTML for review. Used for browser rendering.",
      )
      .default("text/plain"),
  })
  .strict();

export interface GetFileFeedbackParams {
  filePath?: string;
  content?: string;
  contentType?: string;
}

export interface GetFileFeedbackResult {
  status: "accepted" | "rejected";
  comment?: string;
  filePath?: string;
  rejectedFilePath?: string;
}

export async function execute(
  {filePath, content, contentType = "text/plain"}: GetFileFeedbackParams,
  agent: Agent,
): Promise<string | GetFileFeedbackResult> {
  const fileSystem = agent.requireServiceByType(FileSystemService);

  // Validate required parameters – throw error instead of returning
  if (!filePath || !content) {
    throw new Error(
      `[${name}] filePath and content are required parameters for getFileFeedback.`,
    );
  }

  // 1. Create a temp workspace
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX));

  // Define user content file name for text/html scenario
  const userContentFileName = "user_content.html";

  // If contentType is text/html, write the content to user_content.html
  if (contentType === "text/html") {
    await fs.writeFile(path.join(tmpDir, userContentFileName), content, "utf8");
  }

  // 2. Make index.html for review UI
  const indexHtmlContent = genFileViewHTML({
    contentString: content,
    contentType,
    htmlContentPath:
      contentType === "text/html" ? `./${userContentFileName}` : undefined,
  });
  await fs.writeFile(path.join(tmpDir, "index.html"), indexHtmlContent, "utf8");

  // 3. Spin up preview server
  const {resultPromise, url, stop} = await startFileReviewServer(tmpDir, agent);

  // 4. Launch browser & await user choice
  if (typeof (open as unknown as Function) === "function") {
    await open(url);
    agent.infoLine(`[${name}] File review UI opened at: ${url}`);
  } else {
    agent.infoLine(
      `[${name}] File review UI available at: ${url} (open command mocked/unavailable)`,
    );
  }
  const result: { accepted: boolean; comment?: string } = await resultPromise;

  // 5. If accepted ➜ copy into repo
  if (result.accepted) {
    await fileSystem.writeFile(filePath, content, agent);
    agent.infoLine(
      `[${name}] Feedback accepted. Content written to ${filePath}`,
    );
  } else {
    const rejectFile = filePath.replace(
      /(\.[^.]+)$|$/,
      `.rejected${format(new Date(), "yyyyMMdd-HHmmss")}$1`,
    );
    await fileSystem.writeFile(rejectFile, content, agent);
    agent.infoLine(
      `[${name}] Feedback rejected. Content written to ${rejectFile}`,
    );
  }

  // 6. Cleanup
  try {
    await fs.rm(tmpDir, {recursive: true, force: true});
  } catch (err: unknown) {
    agent.errorLine(
      `[${name}] Error cleaning up temporary directory ${tmpDir}`, err as Error,
    );
  }
  stop();

  return {
    status: result.accepted ? "accepted" : "rejected",
    comment: result.comment,
    filePath: result.accepted ? filePath : undefined,
    rejectedFilePath: result.accepted ? undefined : filePath,
  };
}

function escapeHTML(str: string) {
  const map: Record<'&' | '<' | '>' | '"' | "'", string> = {
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
  htmlContentPath?: string;
}) {
  let displayContentHtml: string;
  let effectiveContentType = contentType;

  if (contentType === "text/markdown" || contentType === "text/x-markdown") {
    const rawMarkup = marked.parse(contentString);
    displayContentHtml = `<div class="markdown-body" style="padding:10px; border:1px solid #ccc; min-height:50vh;">${rawMarkup}</div>`;
  } else if (contentType === "text/html") {
    displayContentHtml = `<iframe src="${htmlContentPath}" style="width:100%; height:80vh; border:1px solid #ccc;"></iframe>`;
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
      <h3>Reviewing Content (Type: ${effectiveContentType})</h3>
      ${displayContentHtml}
    </div>
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        const acceptBtn = document.getElementById('acceptBtn');
        const rejectBtn = document.getElementById('rejectBtn');

        const submitFeedback = (accepted) => (e) => {
         e.preventDefault();
         const comment = document.getElementById('commentBox').value;
         fetch('/result', {
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

async function startFileReviewServer(tmpDir: string, agent: Agent) {
  const app = express();
  app.use(express.json());
  app.use("/", express.static(tmpDir));

  let resolveResult: (value: { accepted: boolean; comment?: string }) => void;
  const resultPromise: Promise<{ accepted: boolean; comment?: string }> = new Promise(
    (r) => (resolveResult = r),
  );

  app.post("/result", (req: Request, res: Response) => {
    const {accepted, comment} = req.body as { accepted: boolean; comment?: string };
    res.status(200).send("ok");
    resolveResult({accepted, comment});
    agent.infoLine(
      `[${name}] Feedback received: ${accepted ? "Accepted" : "Rejected"}${
        comment ? " with comment: " + comment : ""}`
    );
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));

  const address = server.address();
  const port = typeof address === "string" ? 0 : (address?.port ?? 0);
  const url = `http://localhost:${port}/index.html`;
  agent.infoLine(
    `[${name}] File review server running. Please navigate to: ${url}`,
  );

  return {
    resultPromise,
    url,
    stop: () => server.close(() => agent.infoLine(`[${name}] File review server stopped.`)),
  };
}
