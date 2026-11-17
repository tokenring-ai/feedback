import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { FileSystemService } from "@tokenring-ai/filesystem";
import WebHostService from "@tokenring-ai/web-host/WebHostService";
import esbuild from "esbuild";
import { externalGlobalPlugin } from "esbuild-plugin-external-global";
import open from "open";
import { z } from "zod";
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

    // 3. Make the content page
    const html = genHTML({ bundlePath: "./bundle.js" });
    // The component's page; FeedbackResource serves the review page around it (in a sandboxed frame).
    await fs.writeFile(path.join(tmp, "content.html"), html, "utf8");

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
    <style>body { font-family: sans-serif; }</style>
  </head>
  <body>
    <div id="root"></div>

    <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script>
      window.JSX = {
        Fragment: React.Fragment,
        jsx: function (type, props, key) {
          if (key != null) props = Object.assign({}, props, { key: key });
          return React.createElement(type, props);
        },
        jsxs: function (type, props, key) {
          if (key != null) props = Object.assign({}, props, { key: key });
          return React.createElement(type, props);
        }
      };
    </script>
    <script src="${bundlePath}"></script>
    <script>
      var root = window.ReactDOM.createRoot(document.getElementById('root'));
      try {
        var Component = (window.App && window.App.default) || window.App;
        if (typeof Component !== "function") {
          throw new Error("No default export found. Use 'export default' for your React component.");
        }
        root.render(React.createElement(Component));
      } catch (e) {
        var pre = document.createElement('pre');
        pre.textContent = 'Render Error: ' + (e && e.message ? e.message : String(e));
        pre.style.color = 'red';
        document.getElementById('root').appendChild(pre);
      }
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
