import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { FileSystemService } from "@tokenring-ai/filesystem";
import esbuild from "esbuild";
import { externalGlobalPlugin } from "esbuild-plugin-external-global";
import open from "open";
import { z } from "zod";
import WebHostService from "../@tokenring-ai/web-host/WebHostService.ts";
import FeedbackService from "../FeedbackService.ts";
import { toRejectedFilePath } from "../rejectedFilePath.ts";

// Export the tool name in the required "packageName/toolName" format.
const name = "feedback_react-feedback";
const displayName = "Feedback/react-feedback";

const TMP_PREFIX = "react-preview-";

/**
 * Render & review a React component in the browser.
 */
const description =
  "This tool lets you solicit feedback from the user, by opening a browser window, where you can show them an HTML document (formatted in jsx, to be rendered via react), and then allows them to accept or reject the document, and optionally add comments, which are then returned to you as a result.";
const inputSchema = z
  .object({
    code: z
      .string()
      .min(1)
      .describe(
        "The complete source code of the React component to be previewed. This should be valid JSX/TSX that can be bundled and rendered in the browser.",
      ),
    file: z.string().exactOptional().describe("The filename/path of the React component to be previewed"),
  })
  .strict();

export interface ReactFeedbackResultAccepted {
  status: "accept";
  comment?: string | undefined;
}

export interface ReactFeedbackResultRejected {
  status: "reject";
  comment?: string | undefined;
}

export type ReactFeedbackResult = ReactFeedbackResultAccepted | ReactFeedbackResultRejected;

/**
 * Standard error shape for tool execution failures.
 */
export interface ToolError {
  error: string;
}

async function execute({ file, code }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const fileSystem = agent.requireService(FileSystemService);
  const feedbackService = agent.requireService(FeedbackService);
  const webHostService = agent.requireService(WebHostService);
  if (file == null) file = `React-Component-Preview-${new Date().toISOString()}.tsx`;

  // 1. Create a temp workspace
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX));
  let sessionId: string | undefined;

  try {
    const jsxPath = path.join(tmp, file);
    await fs.writeFile(jsxPath, code, "utf8");

    // 2. Bundle with esbuild
    const bundlePath = path.join(tmp, "bundle.js");
    const plugins: esbuild.Plugin[] = [
      externalGlobalPlugin({
        react: "window.React",
        "react-dom": "window.ReactDOM",
        "react/jsx-runtime": "window.JSX",
        jQuery: "$",
      }),
    ];

    try {
      await esbuild.build({
        entryPoints: [jsxPath],
        outfile: bundlePath,
        bundle: true,
        jsx: "automatic",
        platform: "browser",
        external: ["react", "react-dom", "react/jsx-runtime"],
        globalName: "window.App",
        plugins,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ToolCallError(name, `Failed to bundle React component: ${detail}`);
    }

    // 3. Make index.html
    const html = genHTML({ bundlePath: "./bundle.js" });
    await fs.writeFile(path.join(tmp, "index.html"), html, "utf8");

    // 4. Register session only after files are ready
    const session = feedbackService.createSession(tmp);
    sessionId = session.id;

    const url = feedbackService.getSessionUrl(session.id, webHostService);
    try {
      await open(url);
      agent.infoMessage(`[${name}] React preview opened at: ${url}`);
    } catch {
      agent.infoMessage(`[${name}] React preview available at: ${url} (open command failed)`);
    }

    let submission: { accepted: boolean; comment?: string | undefined };
    try {
      submission = await session.promise;
    } catch (error) {
      throw new ToolCallError(name, error instanceof Error ? error.message : String(error));
    }

    const result: ReactFeedbackResult = {
      status: submission.accepted ? "accept" : "reject",
      comment: submission.comment,
    };

    // 5. If accepted ➜ copy into repo
    if (result.status === "accept") {
      await fileSystem.writeFile(file, code, agent);
    } else {
      const rejectFile = toRejectedFilePath(file);
      await fileSystem.writeFile(rejectFile, code, agent);
    }

    return {
      message: `**Asked** for feedback`,
      result: JSON.stringify(result),
    };
  } finally {
    // Drop session before deleting files so concurrent requests cannot race the rm.
    if (sessionId) {
      feedbackService.removeSession(sessionId);
    }
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

function genHTML({ bundlePath }: { bundlePath: string }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <style>
      body { margin-top: 6lh; font-family: sans-serif; }
      #overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        display: flex;
        gap: 8px;
        padding: 8px;
        background: #eee;
        z-index: 999;
        align-items: flex-start;
      }
      #overlay button {
        padding: 6px 12px;
        border: 0;
        border-radius: 4px;
        cursor: pointer;
      }
      #accept { background: #77dd77; }
      #reject { background: #ff6961; }
      #commentBox {
        flex: 1;
        min-height: 5lh;
        padding: 6px;
      }
    </style>
  </head>
  <body>
    <div id="overlay">
      <button type="button" id="accept">Accept</button>
      <button type="button" id="reject">Reject</button>
      <textarea id="commentBox" rows="5" name="comment" placeholder="Enter your comments here..."></textarea>
    </div>
    <div id="root"></div>

    <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script>window.JSX = { "jsx": React.createElement, "jsxs": React.createElement};</script>
    <script src="${bundlePath}"></script>
    <script>
      var root = window.ReactDOM.createRoot(document.getElementById('root'));
      root.render(React.createElement(window.App.default));

      // Handle form submission and button clicks
      document.addEventListener('DOMContentLoaded', function() {
        const acceptBtn = document.getElementById('accept');
        const rejectBtn = document.getElementById('reject');
        
        const submit = (accepted) => (e) => {
         e.preventDefault();
         const comment = document.getElementById('commentBox').value;
         // Relative to /feedback/:sessionId/index.html → /feedback/:sessionId/result
         fetch('./result', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ accepted: accepted, comment: comment })
         }).then(() => alert("Submitted!"));
        };
        
        // Handle accept button
        acceptBtn.addEventListener('click', submit(true));
        
        // Handle reject button
        rejectBtn.addEventListener('click', submit(false))
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
