# Feedback Package Documentation

## Overview

The `@tokenring-ai/feedback` package is part of the Token Ring AI framework. It provides a set of tools that enable AI agents to solicit and collect feedback from human users during task execution. This is crucial for iterative development, validation, and human-in-the-loop interactions in AI-driven workflows.

Key functionalities include:
- Asking humans open-ended questions or presenting multiple-choice options.
- Displaying file contents (text, Markdown, HTML, JSON) for review and approval/rejection with comments.
- Rendering React components in a browser for visual feedback and acceptance.

These tools integrate with the `@tokenring-ai/agent` ecosystem, allowing agents to pause execution, interact with users via browser-based UIs or chat, and incorporate responses into their decision-making process. The package emphasizes safe, temporary file handling and automatic cleanup.

## Installation/Setup

This package is designed to be used within a Token Ring AI project. To install:

1. Ensure you have Node.js (v18+) and npm/yarn installed.
2. Add the package as a dependency:
   ```
   npm install @tokenring-ai/feedback
   ```
3. Build the TypeScript code:
   ```
   npm run build
   ```
   This compiles `.ts` files to JavaScript using the provided `tsconfig.json`.

Dependencies are automatically resolved via `package.json`. For development, install dev dependencies:
```
npm install --save-dev typescript @types/express
```

Import the package in your agent setup:
```typescript
import { packageInfo } from '@tokenring-ai/feedback';
```

## Package Structure

The package follows a simple structure:
- **index.ts**: Main entry point. Exports `packageInfo` (implements `TokenRingPackage`) including name, version, description, and the tools object.
- **tools.ts**: Re-exports all tools for easy import.
- **tools/**: Directory containing the core tools:
  - **askHuman.ts**: Handles textual or choice-based questions to humans via chat.
  - **getFileFeedback.ts**: Presents file content in a browser UI for review.
  - **react-feedback.ts**: Bundles and previews React components in the browser.
- **package.json**: Defines metadata, dependencies, scripts (e.g., build), and exports.
- **tsconfig.json**: TypeScript compiler options for ES2022, NodeNext module resolution, strict typing.
- **README.md**: This documentation file.
- **LICENSE**: MIT license.

No subdirectories beyond `tools/`. The package is TypeScript-based and uses ES modules.

## Core Components

The package exposes three main tools, each as a module with `name`, `description`, `inputSchema` (Zod schema), and an `execute` function. Tools are invoked by agents via the `tools` object in `packageInfo`. They require an `Agent` instance and a `FileSystemService` (for file tools).

### askHuman Tool

**Description**: Allows the AI to ask the human a question about the current task. Supports free-text responses or single/multiple-choice selections. The tool logs the question to the agent's chat/info line and returns a result indicating the question has been asked, awaiting human response in the chat.

**Key Methods/Properties**:
- `inputSchema`: Zod object with `question` (string, required), `choices` (string array, optional), `response_type` (enum: 'text' | 'single' | 'multiple', optional).
  - Defaults: 'text' if no choices; 'single' if choices provided without type.
- `execute(params: AskHumanParams, agent: Agent)`: Promise<AskHumanResult>.
  - Throws if `question` missing.
  - Logs question to agent (with choices if provided).
  - Returns result with `status` ('question_asked_text' or 'question_asked_choices'), `question`, `response_type`, `timestamp`, and `message` (instructions for human).

**Interactions**: The human responds directly in the chat interface. No browser UI; it's chat-based. The agent can parse the human's next message as the response.

### getFileFeedback Tool

**Description**: Displays file content in a temporary browser-based UI for human review. Supports rendering as plain text, Markdown (via marked), HTML (iframe), or JSON (pre-formatted). Human can accept/reject with optional comments. If accepted, saves to the specified `filePath` via FileSystemService; if rejected, saves to a timestamped `.rejected` file.

**Key Methods/Properties**:
- `inputSchema`: Zod object with `filePath` (string, required), `content` (string, required), `contentType` (string, default 'text/plain').
  - Supported types: 'text/plain', 'text/markdown', 'text/x-markdown', 'text/html', 'application/json'.
- `execute(params: GetFileFeedbackParams, agent: Agent)`: Promise<GetFileFeedbackResult | string>.
  - Throws if `filePath` or `content` missing.
  - Creates temp dir, generates HTML UI, starts Express server on random port, opens browser.
  - Awaits POST to `/result` for feedback.
  - Returns `{ status: 'accepted' | 'rejected', comment?: string, filePath?: string, rejectedFilePath?: string }`.
  - Logs actions and cleans up temp files.

**Interactions**: Uses Express for a static server serving the review HTML. Human interacts via buttons and textarea. Integrates with FileSystemService for saving.

### react-feedback Tool

**Description**: Bundles provided JSX/TSX code into a React app, serves it via a temporary browser UI, and collects accept/reject feedback with comments. If accepted, saves the code to `file` (or generated path); if rejected, saves to a timestamped `.rejected` file. Uses esbuild for fast bundling and external React from CDN.

**Key Methods/Properties**:
- `inputSchema`: Zod object with `code` (string, required), `file` (string, optional).
- `execute(params: ReactFeedbackParams, agent: Agent)`: Promise<ReactFeedbackResult | ToolError | string>.
  - Throws if `code` missing.
  - Generates temp dir and file if `file` absent (e.g., 'React-Component-Preview-*.tsx').
  - Bundles with esbuild (plugins for external globals like React).
  - Generates HTML with React CDN scripts and overlay UI for feedback.
  - Starts Express server, opens browser, awaits result.
  - Returns `{ status: 'accept' | 'reject' | 'rejected', comment?: string }`.
  - Logs preview URL and cleans up.

**Interactions**: Similar to getFileFeedback but focused on React. Uses `externalGlobalPlugin` for browser globals. Human sees rendered component with accept/reject buttons.

**Overall Interactions**: All tools pause agent execution until feedback is received. File-based tools use temp directories (prefixed 'file-feedback-' or 'react-preview-') and auto-cleanup. They require `FileSystemService` and log via `agent.infoLine`/`agent.errorLine`.

## Usage Examples

### 1. Asking a Text Question
```typescript
import { askHuman } from '@tokenring-ai/feedback/tools/askHuman.js';

const agent = // ... your Agent instance

const result = await askHuman.execute(
  { question: 'What improvements would you suggest for this feature?' },
  agent
);
console.log(result.message); // "The question has been asked to the human. Please provide your textual response in the chat."
// Human responds in chat; agent processes next.
```

### 2. Multiple-Choice Question
```typescript
const result = await askHuman.execute(
  {
    question: 'Which option do you prefer?',
    choices: ['Option A', 'Option B', 'Option C'],
    response_type: 'multiple'
  },
  agent
);
// Logs numbered choices; human selects (e.g., "1,3") in chat.
```

### 3. Reviewing File Content (Markdown)
```typescript
import { getFileFeedback } from '@tokenring-ai/feedback/tools/getFileFeedback.js';

const content = '# Sample Markdown\nThis is **bold** text.';
const result = await getFileFeedback.execute(
  {
    filePath: 'docs/sample.md',
    content,
    contentType: 'text/markdown'
  },
  agent
);
if (result.status === 'accepted') {
  console.log('Content saved to', result.filePath);
}
```

### 4. Previewing a React Component
```typescript
import { reactFeedback } from '@tokenring-ai/feedback/tools/react-feedback.js';

const jsxCode = `
import React from 'react';
export default function MyComponent() {
  return <div>Hello, Feedback!</div>;
}
`;
const result = await reactFeedback.execute(
  { code: jsxCode, file: 'src/MyComponent.tsx' },
  agent
);
if (result.status === 'accept') {
  console.log('Component saved');
}
```

## Configuration Options

- **contentType** (getFileFeedback): Controls rendering ('text/plain' default). Markdown uses `marked` library; HTML via iframe.
- **response_type** (askHuman): Defaults based on `choices` presence.
- No environment variables or global configs; tool params are per-invocation.
- Server ports are auto-assigned (random available port via `server.listen(0)`).
- Temp directories use OS tmpdir with prefixes for isolation.

## API Reference

### askHuman
- **execute(params: { question: string; choices?: string[]; response_type?: 'text'|'single'|'multiple' }, agent: Agent)**: Promise<AskHumanResult>
  - Returns: Object with `status`, `question`, `response_type`, `timestamp`, `message`, optional `choices`.

### getFileFeedback
- **execute(params: { filePath: string; content: string; contentType?: string }, agent: Agent)**: Promise<GetFileFeedbackResult>
  - Returns: Object with `status` ('accepted'|'rejected'), `comment?`, `filePath?`, `rejectedFilePath?`.

### reactFeedback
- **execute(params: { code: string; file?: string }, agent: Agent)**: Promise<ReactFeedbackResult | ToolError>
  - Returns: `{ status: 'accept'|'reject'|'rejected'; comment?: string }` or `{ error: string }`.

All tools use Zod for input validation. Errors throw exceptions (e.g., missing params).

## Dependencies

- **Core Token Ring**: `@tokenring-ai/agent@0.1.0`, `@tokenring-ai/filesystem@0.1.0`
- **Build/Bundling**: `esbuild@^0.25.9`, `esbuild-plugin-external-global@^1.0.1`
- **Server/UI**: `express@^5.1.0`, `open@^10.2.0`
- **Rendering**: `marked@^16.1.2` (Markdown), `moment-timezone@^0.6.0` (timestamps), `react@^19.1.1`, `react-dom@^19.1.1`
- **Validation**: `zod` (peer or bundled)
- **Dev**: `typescript@^5.9.2`, `@types/express@^5.0.3`

## Contributing/Notes

- **Building/Testing**: Run `npm run build` to compile. Tests can use Vitest (mentioned in tsconfig). No test files in current structure.
- **Limitations**: Browser tools require a graphical environment (e.g., no headless servers without X11 forwarding). `open` may fail in some envs (falls back to URL logging). React previews use development CDNs; production use not supported. Binary files not handled (text-only focus). Temp cleanup is best-effort.
- **Error Handling**: Tools throw on invalid inputs; use try-catch in agent code. Logs errors via agent.
- Contributions: Follow TypeScript strict mode. Update schemas for new params. Ensure temp file security (no sensitive data exposure).

For issues or extensions, refer to the Token Ring AI repository guidelines.