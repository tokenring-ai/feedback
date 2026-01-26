# @tokenring-ai/feedback

## Overview

The `@tokenring-ai/feedback` package provides essential tools for human-in-the-loop interactions in AI-driven workflows. It allows AI agents to pause execution, present information to users, and collect feedback through two main mechanisms: interactive chat-based questioning and browser-based file and component reviews.

## Key Features

- **Interactive Questioning**: Ask humans multiple questions via chat with support for text responses or multiple-choice options
- **File Content Review**: Display file contents (text, Markdown, HTML, JSON) in browser UIs for approval/rejection with comments
- **React Component Preview**: Bundle and preview React components in browsers for visual feedback
- **Seamless Integration**: Automatically registers with Token Ring applications via plugin system
- **Auto-Cleanup**: Automatic cleanup of temporary files and directories
- **Type-Safe**: Full TypeScript support with Zod schema validation
- **Browser Preview**: Uses Express servers for local preview with user interaction feedback

## Installation

```bash
bun install @tokenring-ai/feedback
```

## Package Structure

```
pkg/feedback/
├── index.ts                  # Main entry point
├── plugin.ts                 # TokenRing plugin integration
├── tools.ts                  # Tool exports aggregator
├── tools/                    # Core feedback tools
│   ├── askQuestions.ts      # Human questioning via chat
│   ├── getFileFeedback.ts   # File content browser review
│   └── react-feedback.ts    # React component preview
├── package.json              # Package metadata and dependencies
├── vitest.config.ts          # Testing configuration
└── README.md                 # This documentation
```

## Usage

### Plugin Integration

The package integrates with Token Ring applications as a plugin. All tools are automatically registered with the chat service when installed.

```typescript
import TokenRingApp from "@tokenring-ai/app";
import feedbackPlugin from "@tokenring-ai/feedback/plugin";

const app = new TokenRingApp();
app.install(feedbackPlugin);

// Tools are now available via the chat service
// Use: Feedback/askQuestions, Feedback/getFileFeedback, Feedback/react-feedback
```

### Tools

#### Feedback/askQuestions

**Tool Name**: `ask_questions`

**Description**: The ask_questions tool is to be called when feedback from the user is necessary, or when you are unsure or uncertain about the proper path to take, or are unsure about how to complete the task the user has given. If there is uncertainty about the task to be completed, or you are worried about doing something incorrectly, use this tool, as it provides a strong guarantee that you are doing things aligned with the users intents. You can ask one or more questions, and you can also provide choices for the user to choose from for each one. The user will either pick one of these choices, or respond with their own answer if none of the options are aligned with their intent.

**Input Schema** (Zod):

```typescript
{
  message: string,                           // Required: Description of the problem or uncertainty
  questions: Array<{
    question: string,                        // Required: Question to ask the user
    choices: string[]                       // Required: Suggested choices for the user to select from
  }>
}
```

**Example Usage**:

```typescript
const result = await askQuestions.execute({
  message: "I'm unsure about the best approach for this feature.",
  questions: [
    {
      question: "Which implementation method do you prefer?",
      choices: ["Method A", "Method B", "Method C"]
    }
  ]
}, agent);

// Ask multiple questions
const result = await askQuestions.execute({
  message: "I need information to complete this task properly.",
  questions: [
    {
      question: "What is the priority level?",
      choices: ["High", "Medium", "Low"]
    },
    {
      question: "What is the deadline?",
      choices: ["Urgent", "Within week", "Flexible"]
    }
  ]
}, agent);

// Ask a question without choices (freeform response)
const result = await askQuestions.execute({
  message: "I need additional information about the requirements.",
  questions: [
    {
      question: "What specific details do you need to provide?",
      choices: []  // Empty choices array allows freeform input
    }
  ]
}, agent);
```

**Response Format**:

Returns a string with the user's responses formatted as:

```
The user has provided the following responses:

Question 1
Answer 1

Question 2
Answer 2
```

**Behavior**:
- If choices are provided, users can select one option or choose "Other" for freeform input
- If no choices are provided, users can type freeform responses
- The tool continues asking questions until all are answered
- If a user doesn't provide an answer, the agent uses its own judgment
- Uses agent's askQuestion API with form-based questions and treeSelect/text fields

#### Feedback/getFileFeedback

**Tool Name**: `feedback_getFileFeedback`

**Description**: This tool allows you to present the content of a file to the user, solicit feedback (accept/reject with comments), and optionally write the content to a specified file path if accepted. If the `contentType` is `text/markdown` or `text/x-markdown`, the content will be rendered as HTML for review. Creates a browser-based UI the user can review and leave comments on.

**Input Schema** (Zod):

```typescript
{
  filePath: string,          // Required: Path where content should be saved if accepted
  content: string,           // Required: The actual text content to be reviewed
  contentType?: string       // Optional: MIME type (text/plain by default). Options: text/plain, text/markdown, text/x-markdown, text/html, application/json
}
```

**Supported Content Types**:

- `text/plain`: Plain text display with HTML escaping for display
- `text/markdown`, `text/x-markdown`: Markdown rendering using marked.js library
- `text/html`: Raw HTML content rendered in an iframe
- `application/json`: JSON formatted with syntax highlighting

**Example Usage**:

```typescript
// Review Markdown content
const result = await getFileFeedback.execute({
  filePath: "docs/sample.md",
  content: "# Sample Markdown\nThis is **bold** text.",
  contentType: "text/markdown"
}, agent);

// Review JSON content
const result = await getFileFeedback.execute({
  filePath: "config/settings.json",
  content: JSON.stringify({ theme: "dark", language: "en" }, null, 2),
  contentType: "application/json"
}, agent);

// Review HTML content
const result = await getFileFeedback.execute({
  filePath: "templates/page.html",
  content: "<h1>Welcome</h1><p>This is HTML content.</p>",
  contentType: "text/html"
}, agent);
```

**Response Format**:

```typescript
{
  status: "accepted" | "rejected",
  comment?: string,          // User's comment if provided
  filePath?: string,         // Path where content was saved (if accepted)
  rejectedFilePath?: string  // Path where content was saved (if rejected)
}
```

**Implementation Details**:

- Creates temporary directory with prefix `file-feedback-`
- Generates HTML review UI with Accept/Reject buttons and comment textarea
- Starts Express server to serve the review UI
- Automatically launches browser to show the review page
- Uses FileSystemService for saving accepted/rejected content
- If rejected, saves content with `.rejectedyyyyMMdd-HHmmss.extension` suffix
- Automatically cleans up temporary files and stops the server
- For Markdown content, uses marked.js library for HTML conversion
- For HTML content, renders in iframe for proper isolation
- Uses safe HTML escaping for plain text and JSON content

#### Feedback/react-feedback

**Tool Name**: `feedback_react-feedback`

**Description**: This tool lets you solicit feedback from the user, by opening a browser window, where you can show them an HTML document (formatted in jsx, to be rendered via react), and then allows them to accept or reject the document, and optionally add comments, which are then returned to you as a result. Bundles React components and renders them in the browser for visual review.

**Input Schema** (Zod):

```typescript
{
  code: string,              // Required: Complete source code of React component to preview
  file?: string              // Optional: Filename/path of the React component (defaults to auto-generated timestamp)
}
```

**Example Usage**:

```typescript
const jsxCode = `
import React from 'react';

export default function MyComponent() {
  return (
    <div style={{ padding: '20px', border: '1px solid #ccc' }}>
      <h1>Hello, Feedback!</h1>
      <p>This component can be reviewed and accepted or rejected.</p>
    </div>
  );
}
`;

const result = await reactFeedback.execute({
  code: jsxCode,
  file: "src/components/MyComponent.tsx"
}, agent);
```

**Response Format**:

Accepted:
```typescript
{
  status: "accept",
  comment?: string
}
```

Rejected:
```typescript
{
  status: "reject" | "rejected",
  comment?: string
}
```

**Implementation Details**:

- Creates temporary directory with prefix `react-preview-`
- Bundles React component code using esbuild
- Configures esbuild with external globals: react, react-dom, react/jsx-runtime
- Uses JSX automatic transformation
- Creates HTML wrapper that loads from CDN: React 18 development builds
- Starts Express server to serve the bundled component
- Automatically launches browser to show the preview
- Uses FileSystemService for saving accepted/rejected files
- If rejected, saves content with `.rejectedyyyyMMdd-HH:mm.extension` suffix
- Automatically cleans up temporary files and stops the server
- Uses JSX automatic mode for proper JSX transformation
- Supports React 18 with direct DOM rendering

## Configuration

### Plugin Configuration

The package automatically registers with Token Ring applications and requires no additional configuration:

```typescript
import { TokenRingPlugin } from "@tokenring-ai/app";
import { z } from "zod";
import packageJSON from './package.json' with {type: 'json'};
import tools from "./tools.ts";

const packageConfigSchema = z.object({});

export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(app, config) {
    if (!config) return;
    app.waitForService(ChatService, chatService =>
      chatService.addTools(packageJSON.name, tools)
    );
  },
  config: packageConfigSchema
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
```

### Required Services

The package requires the following services to be registered:

- **ChatService**: Required for tool registration
- **FileSystemService**: Required by getFileFeedback and reactFeedback tools for file operations
- **Agent**: Required for logging and service access

## Dependencies

### Runtime Dependencies

- `zod@catalog:` - Schema validation
- `esbuild@^0.27.2` - React component bundling
- `esbuild-plugin-external-global@^1.0.1` - External global plugin for esbuild
- `express@^5.2.1` - Web server for preview
- `marked@^17.0.1` - Markdown rendering
- `date-fns@^4.1.0` - Date formatting
- `date-fns-tz@^3.2.0` - Time zone support (available but not currently used)
- `open@^11.0.0` - Browser launcher
- `react@catalog:` - React library (pinned to specific version)
- `react-dom@catalog:` - React DOM library (pinned to specific version)

### Development Dependencies

- `typescript@catalog:` - TypeScript compiler
- `@types/express@^5.0.6` - Express type definitions
- `vitest@catalog:` - Testing framework

### Token Ring Dependencies

- `@tokenring-ai/app@0.2.0` - Base application framework
- `@tokenring-ai/chat@0.2.0` - Chat service
- `@tokenring-ai/agent@0.2.0` - Agent system and question schema
- `@tokenring-ai/filesystem@0.2.0` - File system service

## Error Handling

All tools follow consistent error handling patterns:

### Parameter Validation

```typescript
// askQuestions: Validates message and questions are provided
if (!message || !questions) {
  throw new Error(`[ask_questions] message and questions are required parameters.`);
}

// getFileFeedback: Validates filePath and content are provided
if (!filePath || !content) {
  throw new Error(
    `[feedback_getFileFeedback] filePath and content are required parameters.`
  );
}

// reactFeedback: Validates code is provided
if (!code) {
  throw new Error(`[feedback_react-feedback] code is required parameter.`);
}
```

### Graceful Failure

- Invalid input parameters: Throws errors with descriptive messages
- File system operations: Handle errors with logging without crashing
- Server startup: Log errors and fall back to URL reporting
- Cleanup operations: Caught errors are logged but don't stop execution

### Error Types

1. **Validation Errors**: Missing required parameters or invalid input types
2. **File System Errors**: File I/O operations, permissions, path validation
3. **Network Errors**: Server startup, browser launch, HTTP requests
4. **Build Errors**: React component bundling failures (esbuild errors)
5. **Agent Errors**: Service integration issues

## Development

### Building

```bash
# Build the package TypeScript files (no Emit)
bun run build
```

### Testing

```bash
# Run tests
bun run test

# Run tests in watch mode
bun run test:watch

# Run tests with coverage
bun run test:coverage
```

### Testing Structure

- Uses vitest for testing
- Tests are located in `**/*.test.ts` files
- Node environment for test execution
- Isolated test runs with globals enabled

## Integration Patterns

### Service Access

```typescript
// Access required services
const fileSystem = agent.requireServiceByType(FileSystemService);

// Use agent logging for tool execution
agent.infoMessage(`[tool-name] Operation started`);
agent.infoMessage(`[tool-name] File review server running at ${url}`);
agent.errorMessage(`[tool-name] Operation failed:`, error);
```

### Tool Registration

Tools are registered via the plugin system:

```typescript
app.waitForService(ChatService, chatService =>
  chatService.addTools(packageName, tools)
);
```

Where `tools` exports individual tool definitions with the proper structure:

```typescript
export default {
  name: "tool_name",
  displayName: "Category/name",
  description: "Tool description",
  inputSchema: z.object({ ... }),
  execute: async (params, agent) => { ... }
};
```

## License

MIT License - see [LICENSE](./LICENSE) file for details.