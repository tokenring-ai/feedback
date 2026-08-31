# @tokenring-ai/feedback

Interactive tools for gathering human input and reviewing agent proposals.

## Overview

The `@tokenring-ai/feedback` package provides interactive tools for gathering
human input and reviewing agent proposals. It enables human-in-the-loop
interactions in AI-driven workflows by allowing AI agents to pause execution,
present information to users, and collect feedback through three mechanisms:

- Interactive chat-based questioning
- Browser-based file content review
- React component previews

The browser-based tools serve their preview UIs through a shared
`WebHostService` rather than spinning up per-request HTTP servers. A
`FeedbackService` manages in-flight browser sessions, and a `FeedbackResource`
registered on the web host serves static files and collects accept/reject
submissions.

### Key Features

- **Interactive Questioning**: Ask humans multiple questions via chat with
  support for text responses or multiple-choice options
- **File Content Review**: Display file contents (text, Markdown, HTML, JSON)
  in browser UIs for approval/reject with comments
- **React Component Preview**: Bundle and preview React components in browsers
  for visual feedback and approval
- **Shared WebHost Integration**: Browser UIs are served from the shared
  `WebHostService` via `FeedbackResource` — no per-session HTTP servers
- **Session Timeout**: Browser feedback sessions time out after 5 minutes by
  default (configurable per session)
- **Auto-Cleanup**: Automatic cleanup of temporary files and directories
- **Type-Safe**: Full TypeScript support with Zod schema validation

## Installation

```bash
bun add @tokenring-ai/feedback
```

## Chat Commands

This package does not define any chat commands. Tools are invoked through the
`ChatService` tool-calling mechanism, not through slash commands.

## Tools

| Tool Name                  | Display Name               | Description                                                                                                     |
|----------------------------|----------------------------|-----------------------------------------------------------------------------------------------------------------|
| `ask_questions`            | `Feedback/askQuestions`    | Ask questions via chat with form inputs                                                                         |
| `feedback_getFileFeedback` | `Feedback/getFileFeedback` | Present file content for review and solicit accept/reject feedback                                               |
| `feedback_react-feedback`  | `Feedback/react-feedback`  | Show a React component in a browser for accept/reject feedback                                                   |

### Feedback/askQuestions

**Tool Name**: `ask_questions`

**Description**: The ask_questions tool is to be called when feedback from the
user is necessary, or when you are unsure or uncertain about the proper path to
take, or are unsure about how to complete the task the user has given. If there
is uncertainty about the task to be completed, or you are worried about doing
something incorrectly, use this tool, as it provides a strong guarantee that you
are doing things aligned with the users intents. You can ask one or more
questions, and you can also provide choices for the user to choose from for each
one. The user will either pick one of these choices, or respond with their own
answer if none of the options are aligned with their intent.

**Input Schema**:

| Parameter               | Type     | Required | Description                                                                  |
|:------------------------|:---------|:---------|:-----------------------------------------------------------------------------|
| `message`               | string   | Yes      | Free-form, paragraph-sized message explaining the problem or uncertainty      |
| `questions`             | array    | Yes      | One or more questions to ask the human (minimum 1)                            |
| `questions[].question`  | string   | Yes      | A question to ask the human                                                  |
| `questions[].choices`   | string[] | Yes      | Suggested choices for the human to select from (empty array for freeform)      |

**Example**:

```typescript
import askQuestions from "@tokenring-ai/feedback/tools/askQuestions";

const result = await askQuestions.execute({
  message: "I'm unsure about the approach to take for this refactoring.",
  questions: [
    {
      question: "Which refactoring method do you prefer?",
      choices: ["Extract to separate module", "Inline functions", "Keep as-is"],
    },
    {
      question: "Should we add tests before or after?",
      choices: [], // Freeform answer
    },
  ],
}, agent);
```

**Response Format**:

Returns a `TokenRingToolResult` with `message` and `result` properties. The
`result` contains a formatted string with user responses:

```text
The user has provided the following responses:

Which refactoring method do you prefer?
Extract to separate module

Should we add tests before or after?
After implementation
```

When no questions are provided, returns `{ failed: true }` with an error message
indicating at least one question is required.

**Error Handling**:

- Returns `{ failed: true }` if no questions are provided
- Throws `ToolCallError` if user does not respond to the question prompt
- Throws `ToolCallError` if invalid response is received (missing `Questions`
  property)
- Sets default answer (`"The user did not provide an answer, use your own
  judgement"`) if user provides no answer
- Supports iterative questioning until all questions are answered
- Handles `__other__` selection by converting to freeform text input

---

### Feedback/getFileFeedback

**Tool Name**: `feedback_getFileFeedback`

**Description**: This tool allows you to present the content of a file to the
user, solicit feedback (accept/reject with comments), and optionally write the
content to a specified file path if accepted. If the `contentType` is
`text/markdown` or `text/x-markdown`, the content will be rendered as HTML for
review.

**Input Schema** (strict — rejects unknown properties):

| Parameter     | Type   | Required | Default       | Description                                                                         |
|:--------------|:-------|:---------|:--------------|:-----------------------------------------------------------------------------------|
| `filePath`    | string | Yes      | —             | Path where the file content should be saved if accepted (minimum length 1)          |
| `content`     | string | Yes      | —             | The actual text content to be reviewed (minimum length 1)                           |
| `contentType` | string | No       | `text/plain`  | MIME type of the content; controls browser rendering                                |

**Supported Content Types**:

| Content Type       | Rendering Method                             |
|:-------------------|:---------------------------------------------|
| `text/plain`       | Plain text with HTML escaping in `<pre>` tag |
| `text/markdown`    | Markdown rendered to HTML using marked.js    |
| `text/x-markdown`  | Markdown rendered to HTML using marked.js    |
| `text/html`        | Raw HTML content rendered in iframe          |
| `application/json` | JSON with HTML escaping in `<pre>` tag       |

**Example**:

```typescript
import getFileFeedback from "@tokenring-ai/feedback/tools/getFileFeedback";

const result = await getFileFeedback.execute({
  filePath: "docs/sample.md",
  content: "# Sample\n\nThis is **bold** text and `code`.",
  contentType: "text/markdown",
}, agent);
```

**Response Format**:

Returns a `TokenRingToolResult` where `result` is a JSON string with the
following structure:

```json
{
  "status": "accepted" | "rejected",
  "comment": "optional user comment",
  "filePath": "path if accepted",
  "rejectedFilePath": "original filePath if rejected"
}
```

**Error Handling**:

- Throws `ToolCallError` if the session promise rejects (e.g. timeout)
- Cleanup errors are logged as warnings but do not stop execution
- Requires a running `WebHostService` (shared host; no per-session server)
- Rejected files are saved with `.rejected` prefix and timestamp

**Exported Types**:

```typescript
export interface GetFileFeedbackResult {
  status: "accepted" | "rejected";
  comment?: string | undefined;
  filePath?: string | undefined;
  rejectedFilePath?: string | undefined;
}
```

---

### Feedback/react-feedback

**Tool Name**: `feedback_react-feedback`

**Description**: This tool lets you solicit feedback from the user, by opening a
browser window, where you can show them an HTML document (formatted in jsx, to
be rendered via react), and then allows them to accept or reject the document,
and optionally add comments, which are then returned to you as a result.

**Input Schema** (strict — rejects unknown properties):

| Parameter | Type   | Required | Description                                                                |
|:----------|:-------|:---------|:---------------------------------------------------------------------------|
| `code`    | string | Yes      | Complete source code of the React component (valid JSX/TSX, minimum length 1) |
| `file`    | string | No       | Filename/path of the React component to be previewed                       |

**Example**:

```typescript
import reactFeedback from "@tokenring-ai/feedback/tools/react-feedback";

const result = await reactFeedback.execute({
  code: `
    export default function MyComponent() {
      return (
        <div style={{ padding: '20px' }}>
          <h1>Hello, Feedback!</h1>
        </div>
      );
    }
  `,
  file: "src/components/MyComponent.tsx",
}, agent);
```

**Response Format**:

Returns a `TokenRingToolResult` where `result` is a JSON string with the
following structure:

```json
// Accepted
{ "status": "accept", "comment": "optional comment" }

// Rejected
{ "status": "reject", "comment": "optional comment" }
```

**Technical Details**:

- Components are bundled using esbuild with JSX automatic transformation
- React and React DOM are loaded from unpkg CDN (version 18)
- External dependencies (react, react-dom, react/jsx-runtime, jQuery) are
  treated as global variables
- Components must export a default function component
- Temporary files are automatically cleaned up after feedback is received
- If no `file` is provided, a default filename is generated using ISO timestamp

**Error Handling**:

- Throws `ToolCallError` if the esbuild bundling fails
- Throws `ToolCallError` if the session promise rejects (e.g. timeout)
- Cleanup is performed after file operations
- Feedback session is removed from `FeedbackService` after cleanup
- Rejected files are saved with `.rejected` prefix and timestamp

**Exported Types**:

```typescript
export interface ReactFeedbackResultAccepted {
  status: "accept";
  comment?: string | undefined;
}

export interface ReactFeedbackResultRejected {
  status: "reject";
  comment?: string | undefined;
}

export type ReactFeedbackResult =
  | ReactFeedbackResultAccepted
  | ReactFeedbackResultRejected;

export interface ToolError {
  error: string;
}
```

## Configuration

The plugin accepts no configuration options. It has no `configSchema` and its
`install` method takes no config parameter.

### Plugin Registration

```typescript
import TokenRingApp from "@tokenring-ai/app";
import PluginManager from "@tokenring-ai/app/PluginManager";
import feedbackPlugin from "@tokenring-ai/feedback/plugin";

const app = new TokenRingApp({
  app: { workingDirectory, workspaceDirectory, configDirectories },
});
const pluginManager = app.addService(new PluginManager(app));
await pluginManager.installPlugins([feedbackPlugin]);

// Tools are now available via the chat service
```

The plugin automatically registers all tools with the `ChatService`, registers
a `FeedbackService` for session management, and registers a `FeedbackResource`
on the `WebHostService` upon installation.

### Required Services

- **ChatService**: Required for tool registration (handled by plugin)
- **WebHostService**: Required to serve browser feedback UIs via
  `FeedbackResource`
- **FeedbackService**: Registered by this plugin; manages in-flight browser
  sessions
- **FileSystemService**: Required by `getFileFeedback` and `react-feedback`
- **Agent**: Required for logging and service access

## Core Components

### FeedbackService

Manages in-flight browser feedback sessions. HTTP is served by
`FeedbackResource` on the shared `WebHostService` (not a per-session HTTP
server).

**File**: `plugin/feedback/FeedbackService.ts`

**Service name**: `FeedbackService`

**Service description**: `Browser-based human feedback sessions served via WebHost`

**Exports**:

- `FEEDBACK_PATH_PREFIX` — URL path prefix: `"/feedback"`
- `DEFAULT_FEEDBACK_TIMEOUT_MS` — default timeout: `300_000` (5 minutes)
- `FeedbackSubmission` — `{ accepted: boolean; comment?: string | undefined }`
- `CreateSessionOptions` — `{ timeoutMs?: number | undefined }`
- `FeedbackSession` — session object (see below)

**Methods**:

| Method                                                                 | Description                                                                                          |
|:----------------------------------------------------------------------|:-----------------------------------------------------------------------------------------------------|
| `createSession(rootDir: string, options?: CreateSessionOptions): FeedbackSession` | Create a new session with a random UUID, optional timeout, and a deferred promise            |
| `getSession(id: string): FeedbackSession \| undefined`                 | Retrieve a session by ID                                                                             |
| `completeSession(id: string, result: FeedbackSubmission): boolean`     | Resolve a session's promise with the submission result; returns `true` if the session existed       |
| `removeSession(id: string, reason?: Error): void`                      | Remove a session; rejects its promise if not yet settled (prevents hanging waiters)                  |
| `getSessionUrl(sessionId: string, webHost: WebHostService, entry: string = "index.html"): string` | Build the public browser URL for a session entry page; maps `0.0.0.0` to `127.0.0.1`      |

**FeedbackSession properties**:

| Property  | Type                              | Description                                                        |
|:----------|:----------------------------------|:-------------------------------------------------------------------|
| `id`      | string                            | Unique session identifier (UUID)                                   |
| `rootDir` | string                            | Root directory for static file serving                             |
| `promise` | `Promise<FeedbackSubmission>`     | Deferred promise that resolves on feedback or rejects on timeout   |
| `resolve` | `(result: FeedbackSubmission) => void` | Resolve function (guarded against double-settle)              |
| `reject`  | `(error: Error) => void`          | Reject function (guarded against double-settle)                    |
| `settled` | boolean                           | Whether the session has been resolved or rejected                  |

### FeedbackResource

A `WebResource` implementation that serves browser feedback UIs and collects
accept/reject submissions on the shared `WebHostService`.

**File**: `plugin/feedback/FeedbackResource.ts`

**Routes**:

| Route                                | Methods    | Description                                                                                |
|:-------------------------------------|:-----------|:-------------------------------------------------------------------------------------------|
| `/feedback/:sessionId/result`        | POST       | Accepts `{ accepted: boolean, comment?: string }` JSON body; completes the session         |
| `/feedback/:sessionId/*`             | GET, HEAD  | Serves static files from the session's `rootDir` with path traversal protection            |

The POST `/result` route returns `405` for non-POST methods, `404` for unknown
sessions, `400` for invalid JSON or missing `accepted` field, and `200` on
success. The GET/HEAD wildcard route returns `405` for non-GET/HEAD methods,
`400` for undecodable paths, `404` for unknown sessions or non-file targets,
and `403` if the resolved path escapes the session root.

### rejectedFilePath

Utility function for building Windows-safe rejected-file sibling paths.

**File**: `plugin/feedback/rejectedFilePath.ts`

```typescript
export function toRejectedFilePath(filePath: string, now: Date = new Date()): string
```

Inserts `.rejected<yyyyMMdd-HHmmss>` before the final extension (or at the end
if no extension). The timestamp uses no colons for Windows compatibility.

**Examples**:

- `docs/sample.md` becomes `docs/sample.rejected20240115-143022.md`
- `my.component.tsx` becomes `my.component.rejected20240115-143022.tsx`
- `README` becomes `README.rejected20240115-143022`

## Services / Lifecycle Methods

The plugin registers a single service at install time:

```typescript
const feedbackService = app.addService(new FeedbackService());
```

The `FeedbackService` implements the `TokenRingService` interface. It has no
`run`, `start`, `stop`, `attach`, or other lifecycle methods — it is a
session registry used by the tools and the `FeedbackResource`.

### Plugin Lifecycle

The plugin (`plugin/feedback/plugin.ts`) defines `install` only. It has no
`configSchema`, no `reconfigure`, and no agent lifecycle hooks.

| Field          | Value                                                  |
|:---------------|:-------------------------------------------------------|
| `name`         | `@tokenring-ai/feedback` (from `package.json`)         |
| `displayName`  | `Human Feedback`                                       |
| `version`      | package version                                        |
| `description`  | package description                                    |

**`install(app)` steps**:

1. Registers `FeedbackService` via `app.addService(new FeedbackService())`.
2. Waits for `ChatService` and adds all three tools via
   `chatService.addTools(tools)`.
3. Waits for `WebHostService` via `app.services.waitForItemByType` and
   registers `FeedbackResource` under the resource name `"feedback"`.

```typescript
import type { TokenRingPlugin } from "@tokenring-ai/app";
import { ChatService } from "@tokenring-ai/chat";
import { WebHostService } from "@tokenring-ai/web-host";
import FeedbackResource from "./FeedbackResource.ts";
import FeedbackService from "./FeedbackService.ts";
import packageJSON from "./package.json" with { type: "json" };
import tools from "./tools.ts";

export default {
  name: packageJSON.name,
  displayName: "Human Feedback",
  version: packageJSON.version,
  description: packageJSON.description,
  install(app) {
    const feedbackService = app.addService(new FeedbackService());
    app.waitForService(ChatService, chatService => chatService.addTools(tools));
    app.services.waitForItemByType(WebHostService, webHostService => {
      webHostService.registerResource("feedback", new FeedbackResource(feedbackService));
    });
  },
} satisfies TokenRingPlugin;
```

## RPC

This package does not define any RPC endpoints.

## Dependencies

| Package                              | Purpose                                                        |
|:-------------------------------------|:---------------------------------------------------------------|
| `@tokenring-ai/app`                  | Plugin and service interfaces (`TokenRingPlugin`, `TokenRingService`) |
| `@tokenring-ai/chat`                 | Chat service for tool registration and tool types              |
| `@tokenring-ai/agent`                | Agent framework and question schema types                      |
| `@tokenring-ai/filesystem`           | File system service for writing accepted/rejected content      |
| `@tokenring-ai/utility`              | `firstOfArrayable` and `EnhancedMap` utilities            |
| `@tokenring-ai/web-host`             | Shared HTTP host for browser feedback UIs (`WebHostService`)   |
| `zod`                                | Schema validation for tool inputs                              |
| `esbuild`                            | React component bundling                                       |
| `esbuild-plugin-external-global`     | ESBuild plugin for externalizing React/jQuery as globals       |
| `marked`                             | Markdown rendering to HTML for file review                     |
| `date-fns`                           | Date formatting for rejected-file timestamps                   |
| `open`                               | Browser launcher                                               |

The package's only development dependency is `typescript` (for `tsc --noEmit`
type checking in the `build` script).

## Testing

```bash
bun test              # run all tests
bun test --watch      # run tests in watch mode
bun test --coverage   # run tests with coverage report
bun run build         # type-check with tsc --noEmit
```

The `bun.config.ts` test configuration targets `**/*.test.ts` in a node
environment. The package ships three test suites:

- `FeedbackService.test.ts` — session creation, completion, timeout rejection,
  double-complete guards, and removal with pending-waiter rejection.
- `FeedbackResource.test.ts` — static file serving, path traversal protection,
  POST `/result` session completion, and 404 for unknown sessions.
- `rejectedFilePath.test.ts` — stamp insertion for single/multi-dot extensions,
  extensionless files, and Windows-safe (no-colon) output.

## License

MIT License — see LICENSE file for details.
