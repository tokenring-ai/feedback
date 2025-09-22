import Agent from "@tokenring-ai/agent/Agent";
import {FileSystemService} from "@tokenring-ai/filesystem";
import esbuild from "esbuild";
import {externalGlobalPlugin} from "esbuild-plugin-external-global";
import express, {type Request, type Response} from "express";
import moment from "moment-timezone";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import open from "open";
import {z} from "zod";

// Export the tool name in the required "packageName/toolName" format.
export const name = "feedback/react-feedback";

const TMP_PREFIX = "react-preview-";

/**
 * Render & review a React component in the browser.
 */
export const description =
  "This tool lets you solicit feedback from the user, by opening a browser window, where you can show them an HTML document (formatted in jsx, to be rendered via react), and then allows them to accept or reject the document, and optionally add comments, which are then returned to you as a result.";
export const inputSchema = z
  .object({
    code: z
      .string()
      .describe(
        "The complete source code of the React component to be previewed. This should be valid JSX/TSX that can be bundled and rendered in the browser.",
      ),
    file: z
      .string()
      .optional()
      .describe("The filename/path of the React component to be previewed"),
  })
  .strict();

export interface ReactFeedbackParams {
  code?: string;
  file?: string;
}

export interface ReactFeedbackResultAccepted {
  status: "accept";
  comment?: string;
}

export interface ReactFeedbackResultRejected {
  status: "reject" | "rejected";
  comment?: string;
}

export type ReactFeedbackResult =
  | ReactFeedbackResultAccepted
  | ReactFeedbackResultRejected;

/**
 * Standard error shape for tool execution failures.
 */
export interface ToolError {
  error: string;
}

export async function execute(
  {file, code}: ReactFeedbackParams,
  agent: Agent,
): Promise<string | ReactFeedbackResult | ToolError> {
  if (!code) {
    // Throw an error instead of returning an error object.
    throw new Error(`[${name}] code is required parameter for react-feedback.`);
  }
  const fileSystem = agent.requireServiceByType(FileSystemService);
  if (file == null)
    file = `React-Component-Preview-${new Date().toISOString()}.tsx`;

  // 1. Create a temp workspace
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX));
  const jsxPath = path.join(tmp, file);
  await fs.writeFile(jsxPath, code, "utf8");

  // 2. Bundle with esbuild
  const bundlePath = path.join(tmp, "bundle.ts");
  // Normalize plugins typing to the esbuild Plugin[] expected by our local esbuild
  const plugins: esbuild.Plugin[] = [
    (externalGlobalPlugin({
      react: "window.React",
      "react-dom": "window.ReactDOM",
      "react/jsx-runtime": "window.JSX",
      jQuery: "$",
    }) as unknown) as esbuild.Plugin,
  ];

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

  // 3. Make index.html
  const html = genHTML({bundlePath: "./bundle.ts"});
  await fs.writeFile(path.join(tmp, "index.html"), html, "utf8");

  // 4. Spin up preview server
  const {resultPromise, url, stop} = await startServer(tmp, agent);

  // 5. Launch browser & await user choice
  await open(url);
  const result = await resultPromise;

  // 6. If accepted ➜ copy into repo
  if (result.status === "accept") {
    await fileSystem.writeFile(file, code);
  } else {
    const rejectFile = file.replace(
      /\./,
      `.rejected${moment().format("YYYYMMDD-HH:mm")}.`,
    );
    await fileSystem.writeFile(rejectFile, code);
  }

  await fs.rm(tmp, {recursive: true, force: true});

  // 7. Cleanup
  stop();

  return result as ReactFeedbackResult;
}

function genHTML({bundlePath}: { bundlePath: string }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <style>
      body{margin-top: 6lh;font-family:sans-serif}
      #overlay{fixed;0;0;0;flex;8px;8px;#eee;z-index:999}
      #overlay button{6px 12px;0;border-radius:4px;pointer}
      #commentBox{100%; min-height: 5lh; 6px;margin-top:8px}
      #commentSubmit{#ffd37b;margin-top:8px}
    </style>
  </head>
  <body>
    <div id="overlay">
      <button type="button" id="accept">Accept</button>
      <button type="button" id="reject">Reject</button>
      <textarea id="commentBox" rows="5" name="comment" placeholder="Enter your comments here..."></textarea>
    </div>
    <div id="root"></div>

    <script src="https://unpkg.com/react@18/umd/react.development.ts"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.ts"></script>
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
         fetch('/result', {
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

async function startServer(tmpDir: string, agent: Agent) {

  const app = express();
  app.use("/", express.static(tmpDir));
  let resolveResult: (value: ReactFeedbackResult) => void;
  const resultPromise: Promise<ReactFeedbackResult> = new Promise(
    (r) => (resolveResult = r),
  );
  app.post("/result", (req: Request, res: Response) => {
    let buf = "";
    req.on("data", (c: Buffer) => (buf += c.toString()));
    req.on("end", () => {
      res.end("ok");
      resolveResult(JSON.parse(buf));
    });
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, () => resolve(undefined)));
  const addr = server.address();
  const port = typeof addr === "object" && addr && "port" in addr ? addr.port : 0;
  const url = `http://localhost:${port}/index.html`;

  // Prefix informational messages with the tool name as required.
  agent.infoLine(`[${name}] Preview running on ${url}`);
  return {
    resultPromise,
    url,
    stop: () => server.close(),
  };
}
