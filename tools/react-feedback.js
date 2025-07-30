import http from "http";
import os from "os";
import path from "path";
/* ---------------- sample test ---------------- */
import ChatService from "@token-ring/chat/ChatService";
import { FileSystemService } from "@token-ring/filesystem";
import esbuild from "esbuild";
import { externalGlobalPlugin } from "esbuild-plugin-external-global";
import express from "express";
// plugins/react-preview/index.js
import fs from "fs/promises";
import moment from "moment-timezone";
import open from "open";
import { z } from "zod";

//const {externalGlobalPlugin} = tmp.;

const TMP_PREFIX = "react-preview-";

/**
 * Render & review a React component in the browser.
 * @param {object} args Tool arguments: { file: string, code: string, exampleProps: object }
 * @param {TokenRingRegistry} registry - The package registry
 */
export const description =
	"This tool lets you solicit feedback from the user, by opening a browser window, where you can show them an HTML document (formatted in jsx, to be rendered via react), and then allows them to accept or reject the document, and optionally add comments, which are then returned to you as a result.";
export const parameters = z
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

export default execute;
export async function execute({ file, code }, registry) {
	const fileSystem = registry.requireFirstServiceByType(FileSystemService);
	if (file == null)
		file = `React-Component-Preview-${new Date().toISOString()}.jsx`;

	// 1. Create a temp workspace
	const tmp = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX));
	const jsxPath = path.join(tmp, file);
	await fs.writeFile(jsxPath, code, "utf8");

	// 2. Bundle with esbuild
	const bundlePath = path.join(tmp, "bundle.js");
	await esbuild.build({
		entryPoints: [jsxPath],
		outfile: bundlePath,
		bundle: true,
		jsx: "automatic",
		platform: "browser",
		external: ["react", "react-dom", "react/jsx-runtime"],
		globalName: "window.App",
		plugins: [
			externalGlobalPlugin.externalGlobalPlugin({
				react: "window.React",
				"react-dom": "window.ReactDOM",
				"react/jsx-runtime": "window.JSX",
				jQuery: "$",
			}),
		],
	});

	// 3. Make index.html
	const html = genHTML({ bundlePath: "./bundle.js" });
	await fs.writeFile(path.join(tmp, "index.html"), html, "utf8");

	// 4. Spin up preview server
	const { resultPromise, stop } = await startServer(tmp, registry);

	// 5. Launch browser & await user choice
	await open(resultPromise.url);
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

	await fs.rmdir(tmp, { recursive: true });

	// 7. Cleanup
	stop();

	return result;
}

function genHTML({ bundlePath }) {
	return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <style>
      body{margin-top: 6lh;font-family:sans-serif}
      #overlay{position:fixed;top:0;left:0;right:0;display:flex;gap:8px;padding:8px;background:#eee;z-index:999}
      #overlay button{padding:6px 12px;border:0;border-radius:4px;cursor:pointer}
      #commentBox{width:100%; min-height: 5lh; padding:6px;margin-top:8px}
      #commentSubmit{background:#ffd37b;margin-top:8px}
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

async function startServer(tmpDir, registry) {
	const chatService = registry.requireFirstServiceByType(ChatService);

	const app = express();
	app.use("/", express.static(tmpDir));
	let resolveResult;
	const resultPromise = new Promise((r) => (resolveResult = r));
	app.post("/result", (req, res) => {
		let buf = "";
		req.on("data", (c) => (buf += c));
		req.on("end", () => {
			res.end("ok");
			resolveResult(JSON.parse(buf));
		});
	});
	const server = http.createServer(app);
	await new Promise((r) => server.listen(0, r));
	const port = server.address().port;
	chatService.systemLine(
		`Preview running on http://localhost:${port}/index.html`,
	);
	resultPromise.url = `http://localhost:${port}/index.html`;
	return {
		resultPromise,
		stop: () => server.close(),
	};
}
