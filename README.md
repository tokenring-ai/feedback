@token-ring/feedback

Overview

- @token-ring/feedback provides human-in-the-loop feedback utilities for the Token Ring ecosystem. It exposes tools to:
- Ask a human clarifying questions (text or choice-based) and record their response context.
- Present file/content for review in the browser (rendering markdown/HTML/JSON/text) and capture Accept/Reject with
  optional comment, writing accepted content into the repository.
- Preview a React component in the browser and capture Accept/Reject with optional comment, writing the accepted code
  to disk.

What this package offers

- Tools namespace (see Exports below)
- tools.askHuman
- tools.getFileFeedback
- tools.reactFeedback

Exports

- index.ts
- name, version, description (from package.json)
- tools (namespace) re-export
- tools.ts
- askHuman (tools/askHuman.ts)
- getFileFeedback (tools/getFileFeedback.ts)
- reactFeedback (tools/react-feedback.ts)

Installation
This package is part of the monorepo and is typically consumed by the Token Ring runtime. If you need to depend on it
directly:

- Add dependency: "@token-ring/feedback": "0.1.0"
- Ensure peer packages are available in your workspace and registered in your ServiceRegistry where appropriate:
- @token-ring/registry
- @token-ring/chat
- @token-ring/filesystem
- Additional runtime deps used internally by certain tools:
- express, open (browser launching), marked (markdown rendering), moment-timezone, esbuild (React preview bundling),
  esbuild-plugin-external-global

Tool: askHuman

- File: pkg/feedback/tools/askHuman.ts
- Description: Ask the human a question and log the prompt to the chat. Supports free-text or choice-based responses
  depending on the parameters you pass. Returns a structured object describing the asked question; the human’s answer is
  expected to be provided via the chat interface.
- Parameters (Zod schema):
- question: string (required)
- choices?: string[]
- Optional. Provide options for single or multiple selection.
- response_type?: "text" | "single" | "multiple"
- Optional. If choices are provided and response_type is omitted, it defaults to "single". If no choices are provided
  and response_type is omitted, it defaults to "text".
- Return shape (type union):
- For textual prompt:
  {
  status: "question_asked_text";
  question: string;
  response_type: "text";
  timestamp: string; // ISO
  message: string; // instruction to provide textual response
  }
- For choices prompt:
  {
  status: "question_asked_choices";
  question: string;
  choices: string[];
  response_type: "single" | "multiple";
  timestamp: string; // ISO
  message: string; // instruction to select an option
  }
- Notes
- If question is missing, the tool logs an error via ChatService and returns an error string.

Usage (askHuman)

import { ServiceRegistry } from "@token-ring/registry";
import ChatService from "@token-ring/chat/ChatService";
import * as askHuman from "@token-ring/feedback/tools/askHuman";

const registry = new ServiceRegistry();
registry.registerService(new ChatService());

// Text question
const resText = await askHuman.execute({ question: "Should we proceed with approach A?" }, registry);

// Multiple choice question
const resChoices = await askHuman.execute({
question: "Pick the target environment",
choices: ["dev", "staging", "prod"],
response_type: "single"
}, registry);

Tool: getFileFeedback

- File: pkg/feedback/tools/getFileFeedback.ts
- Description: Serve a local browser UI to review provided content (text/plain, text/markdown, text/x-markdown,
  text/html, application/json). The user can Accept or Reject with an optional comment. If accepted, the content is
  written to filePath; if rejected, a timestamped .rejected copy alongside filePath is written.
- Parameters (Zod schema):
- filePath: string (required)
- The repository path where content should be stored upon acceptance.
- content: string (required)
- The content to review.
- contentType?: string (default: "text/plain")
- One of e.g. "text/plain", "application/json", "text/markdown", "text/x-markdown", or "text/html". Markdown is
  rendered to HTML; HTML is shown via an iframe; JSON/plain are displayed in a <pre> block.
- Return shape:
  {
  status: "accepted" | "rejected";
  comment?: string;
  filePath?: string; // set when accepted
  rejectedFilePath?: string; // set when rejected (base path used for rejected copy naming)
  }
- Behavior
- Launches a small express server that serves a review UI at a random localhost port and opens it in the system browser
  via open().
- Accept writes content to filePath; Reject writes filePath with a .rejectedYYYYMMDD-HHmmss suffix before the
  extension.
- All key steps are logged via ChatService.
- If filePath or content is missing, logs an error and returns an error string.

Usage (getFileFeedback)

import { ServiceRegistry } from "@token-ring/registry";
import ChatService from "@token-ring/chat/ChatService";
import { FileSystemService } from "@token-ring/filesystem";
import * as getFileFeedback from "@token-ring/feedback/tools/getFileFeedback";

const registry = new ServiceRegistry();
registry.registerService(new ChatService());
registry.registerService(new FileSystemService());

const res = await getFileFeedback.execute({
filePath: "docs/PROPOSAL.md",
content: "# Proposal\n\nThis is a draft.",
contentType: "text/markdown"
}, registry);

Tool: reactFeedback

- File: pkg/feedback/tools/react-feedback.ts
- Description: Bundle and preview a provided React component in the browser, then capture Accept/Reject with an optional
  comment. If accepted, writes the code to the specified file (or a generated name); if rejected, writes a timestamped
  .rejected copy.
- Parameters (Zod schema):
- code: string (required)
- Complete source of the component (JSX/TSX) to preview.
- file?: string
- Optional file path where to write upon acceptance. If omitted, a temporary name is used during preview and the
  accepted content is written to that name in the repository.
- Return shape (union):
- Accepted: { status: "accept"; comment?: string }
- Rejected: { status: "reject" | "rejected"; comment?: string }
- Behavior
- Uses esbuild to bundle the component with externals (react, react-dom, react/jsx-runtime provided via globals),
  serves a simple HTML shell with Accept/Reject and comment field.
- On accept, writes the provided code to file; on reject, writes file with a .rejectedYYYYMMDD-HH:mm suffix.
- Returns the result object and logs the preview URL via ChatService.
- If code is missing, returns an error string.

Usage (reactFeedback)

import { ServiceRegistry } from "@token-ring/registry";
import ChatService from "@token-ring/chat/ChatService";
import { FileSystemService } from "@token-ring/filesystem";
import * as reactFeedback from "@token-ring/feedback/tools/react-feedback";

const registry = new ServiceRegistry();
registry.registerService(new ChatService());
registry.registerService(new FileSystemService());

const code = `export default function Demo(){ return <div>Hello!</div>; }`;
const res = await reactFeedback.execute({ code, file: "components/Demo.tsx" }, registry);

Notes

- These tools presume you register concrete ChatService and FileSystemService instances with your ServiceRegistry so
  they can log and read/write files. The Token Ring runtime typically wires these services for you.
- getFileFeedback renders markdown using marked and opens a temporary HTTP server to host the review UI; ensure
  localhost access is available.
- reactFeedback bundles via esbuild and relies on an HTML shell that exposes React as globals; your component is
  rendered as default export.

License

- MIT (same as the repository license).
