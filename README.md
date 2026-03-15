# @tokenring-ai/feedback

## Overview

The `@tokenring-ai/feedback` package provides essential tools for human-in-the-loop interactions in AI-driven workflows. It allows AI agents to pause execution, present information to users, and collect feedback through three main mechanisms: interactive chat-based questioning, browser-based file content review, and React component previews.

## Key Features

- **Interactive Questioning**: Ask humans multiple questions via chat with support for text responses or multiple-choice options using structured form inputs
- **File Content Review**: Display file contents (text, Markdown, HTML, JSON) in browser UIs for approval/rejection with comments
- **React Component Preview**: Bundle and preview React components in browsers for visual feedback and approval
- **Seamless Integration**: Automatically registers with Token Ring applications via plugin system
- **Auto-Cleanup**: Automatic cleanup of temporary files and directories
- **Type-Safe**: Full TypeScript support with Zod schema validation
- **Browser Preview**: Uses Express servers for local preview with user interaction feedback

## Installation

```bash
bun add @tokenring-ai/feedback
```

## Package Structure

```
pkg/feedback/
├── index.ts                  # Main entry point (currently empty)
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

## Tools

### Feedback/askQuestions

**Tool Name**: `ask_questions`

**Description**: The ask_questions tool is to be called when feedback from the user is necessary, or when you are unsure or uncertain about the proper path to take, or are unsure about how to complete the task the user has given. If there is uncertainty about the task to be completed, or you are worried about doing something incorrectly, use this tool, as it provides a strong guarantee that you are doing things aligned with the users intents. You can ask one or more questions, and you can also provide choices for the user to choose from for each one. The user will either pick one of these choices, or respond with their own answer if none of the options are aligned with their intent.

**Input Schema** (Zod):

```typescript
z.object({
  message: z.string().describe("A free-form, paragraph sized message, explaining the problem you are facing, or the uncertainty you have about the task."),
  questions: z.array(z.object({
    question: z.string().describe("A question to ask the human, such as something to clarify, or to get additional information on."),
    choices: z
      .array(z.string())
      .describe("Suggested choices for the human to select from. The human can choose from any of these options or provide their own response.")
  }))
})
```

**Input Parameters**:

- **message** (string): Required - Free-form paragraph explaining the problem or uncertainty
- **questions** (array): Required - Array of question objects
  - **question** (string): Required - The specific question to ask
  - **choices** (string[]): Required - Suggested choices for the user to select from (can be empty for freeform responses)

**Example Usage**:

```typescript
import askQuestions from "@tokenring-ai/feedback/tools/askQuestions";

// Single question with choices
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

Returns a formatted string with the user's responses:

```
The user has provided the following responses:

Question 1
Answer 1

Question 2
Answer 2
```

**Implementation Details**:

- Form-based questions using agent's `askQuestion` API
- Supports both `treeSelect` (for choices) and `text` (for freeform) input types
- Users can select from choices or choose "Other (Will open a text box for a freeform answer)" for freeform input
- Empty choices array creates text input for freeform responses
- Questions are collected iteratively until all are answered
- If a user doesn't provide an answer, returns "The user did not provide an answer, use your own judgement"
- If user doesn't respond at all, throws error: "The user did not respond to the question prompt. Stop what you are doing. Do not call any more tools until the user gives you further instructions."
- Question items are dynamically transformed: choices → treeSelect, no choices → text

**Behavior**:

- If choices are provided, users can select one option or choose "Other" for freeform input
- If no choices are provided, users can type freeform responses
- The tool continues asking questions until all are answered
- If a user doesn't provide an answer, the agent uses its own judgment
- Uses agent's `askQuestion` API with form-based questions and treeSelect/text fields

**Error Handling**:

- Throws error if user doesn't respond to question prompt at all
- Returns default message if user doesn't provide answer to specific question
- Validates that at least one question is provided

---

### Feedback/getFileFeedback

**Tool Name**: `feedback_getFileFeedback`

**Description**: This tool allows you to present the content of a file to the user, solicit feedback (accept/reject with comments), and optionally write the content to a specified file path if accepted. If the `contentType` is `text/markdown` or `text/x-markdown`, the content will be rendered as HTML for review. Creates a browser-based UI the user can review and leave comments on.

**Input Schema** (Zod):

```typescript
z.object({
  filePath: z.string().describe("The path where the file content should be saved if accepted."),
  content: z.string().describe("The actual text content to be reviewed."),
  contentType: z
    .string()
    .describe("Optional. The MIME type of the content (e.g., 'text/plain', 'text/html', 'application/json', 'text/markdown', 'text/x-markdown'). Defaults to 'text/plain'. If 'text/markdown' or 'text/x-markdown', content is rendered as HTML for review. Used for browser rendering.")
    .default("text/plain")
}).strict()
```

**Input Parameters**:

- **filePath** (string): Required - Path where content should be saved if accepted
- **content** (string): Required - The actual text content to be reviewed
- **contentType** (string, optional): MIME type for content rendering. Defaults to `text/plain`. Options:
  - `text/plain`: Plain text with HTML escaping
  - `text/markdown`, `text/x-markdown`: Markdown rendered to HTML using marked.js
  - `text/html`: Raw HTML content rendered in iframe (saved to separate file)
  - `application/json`: JSON formatted with syntax highlighting

**Supported Content Types**:

- `text/plain`: Plain text display with HTML escaping
- `text/markdown`, `text/x-markdown`: Markdown rendering using marked.js library
- `text/html`: Raw HTML content rendered in iframe (content saved to `user_content.html`)
- `application/json`: JSON formatted with HTML escaping in pre tag

**Example Usage**:

```typescript
import getFileFeedback from "@tokenring-ai/feedback/tools/getFileFeedback";

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

// Review plain text
const result = await getFileFeedback.execute({
  filePath: "README.txt",
  content: "This is plain text content.",
  contentType: "text/plain"
}, agent);
```

**Response Format**:

```typescript
{
  type: "json",
  data: {
    status: "accepted" | "rejected",
    comment?: string,         // User's comment if provided
    filePath?: string,        // Path where content was saved (if accepted)
    rejectedFilePath?: string // Original filePath (if rejected)
  }
}
```

**Implementation Details**:

1. **Temporary Directory**: Creates temp directory with prefix `file-feedback-`
2. **HTML Content Handling**: For `text/html` content type, writes content to `user_content.html` in temp directory
3. **Review UI Generation**: Generates HTML review page with:
   - Accept/Reject buttons at top of page
   - Comment textarea for user feedback
   - Content display area with appropriate rendering
4. **Express Server**: Starts HTTP server to serve the review UI
5. **Browser Launch**: Automatically launches browser using `open` package
6. **Content Rendering**:
   - Markdown: Uses `marked.js` library for HTML conversion with CSS styling
   - HTML: Renders in iframe referencing `user_content.html` for proper isolation
   - JSON: Pre-formatted display with HTML escaping
   - Plain text: Safe HTML escaping for display
7. **File Operations**:
   - If accepted: Saves content to specified `filePath` using FileSystemService
   - If rejected: Saves content with `.rejectedyyyyMMdd-HHmmss` suffix (e.g., `file.rejected20240115-143022.txt`)
8. **Cleanup**: Automatically removes temporary directory and stops server
9. **Error Handling**: Throws error if required parameters are missing; cleanup errors are logged but don't stop execution

**Response Handling**:

```typescript
const result = await getFileFeedback.execute({...}, agent);

if (result.data.status === "accepted") {
  console.log("Content accepted:", result.data.filePath);
  if (result.data.comment) {
    console.log("User comment:", result.data.comment);
  }
} else {
  console.log("Content rejected");
  console.log("Original path:", result.data.rejectedFilePath);
  if (result.data.comment) {
    console.log("User comment:", result.data.comment);
  }
}
```

**Error Handling**:

- Throws error if `filePath` or `content` parameters are missing
- Cleanup errors are caught and logged but don't stop execution
- Server startup errors are logged with fallback URL reporting

---

### Feedback/react-feedback

**Tool Name**: `feedback_react-feedback`

**Description**: This tool lets you solicit feedback from the user, by opening a browser window, where you can show them an HTML document (formatted in JSX, to be rendered via React), and then allows them to accept or reject the document, and optionally add comments, which are then returned to you as a result. Bundles React components and renders them in the browser for visual review.

**Input Schema** (Zod):

```typescript
z.object({
  code: z.string().describe("The complete source code of the React component to be previewed. This should be valid JSX/TSX that can be bundled and rendered in the browser."),
  file: z.string().optional().describe("The filename/path of the React component to be previewed")
}).strict()
```

**Input Parameters**:

- **code** (string): Required - Complete source code of React component to preview (valid JSX/TSX)
- **file** (string, optional): Filename/path of the React component. Defaults to auto-generated timestamped name: `React-Component-Preview-{ISO timestamp}.tsx`

**Example Usage**:

```typescript
import reactFeedback from "@tokenring-ai/feedback/tools/react-feedback";

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

```typescript
// Accepted response
{
  type: "json",
  data: {
    status: "accept",
    comment?: string
  }
}

// Rejected response
{
  type: "json",
  data: {
    status: "reject" | "rejected",
    comment?: string
  }
}
```

**Implementation Details**:

1. **Temporary Directory**: Creates temp directory with prefix `react-preview-`
2. **File Creation**: Writes component code to temp directory with specified filename or timestamped name
3. **Component Bundling**: Uses esbuild to bundle React component:
   - Entry point: Component file in temp directory
   - Output: `bundle.ts` in temp directory
   - JSX transformation: Automatic mode
   - Platform: Browser
   - External dependencies: `react`, `react-dom`, `react/jsx-runtime`
   - Global name: `window.App`
   - Plugin: `esbuild-plugin-external-global` for external globals
4. **HTML Wrapper**: Generates HTML page that:
   - Loads React 18 development builds from CDN (`https://unpkg.com/react@18/umd/react.development.ts`)
   - Loads React DOM 18 from CDN (`https://unpkg.com/react-dom@18/umd/react-dom.development.ts`)
   - Defines `window.JSX` with `React.createElement` for JSX runtime
   - Loads bundled component
   - Renders component using `ReactDOM.createRoot`
   - Includes styled overlay with Accept/Reject buttons and comment textarea
5. **Review UI Features**:
   - Fixed overlay at top with Accept/Reject buttons
   - Comment textarea (5 rows height)
   - Styled with yellow theme for submit button
   - Alert notification on submission
6. **Express Server**: Starts HTTP server to serve the preview
7. **Browser Launch**: Automatically opens browser to preview page
8. **File Operations**:
   - If accepted: Saves component code to specified `file` path using FileSystemService
   - If rejected: Saves component with `.rejectedyyyyMMdd-HH:mm` suffix (e.g., `component.rejected20240115-14:30.tsx`)
9. **Cleanup**: Removes temporary directory and stops server
10. **Error Handling**: Throws error if `code` parameter is missing

**Bundling Configuration**:

```typescript
await esbuild.build({
  entryPoints: [jsxPath],
  outfile: bundlePath,
  bundle: true,
  jsx: "automatic",
  platform: "browser",
  external: ["react", "react-dom", "react/jsx-runtime"],
  globalName: "window.App",
  plugins: [
    externalGlobalPlugin({
      react: "window.React",
      "react-dom": "window.ReactDOM",
      "react/jsx-runtime": "window.JSX",
      jQuery: "$"
    })
  ]
});
```

**CDN Resources**:

- React 18 development: `https://unpkg.com/react@18/umd/react.development.ts`
- React DOM 18 development: `https://unpkg.com/react-dom@18/umd/react-dom.development.ts`
- JSX runtime: `window.JSX = { "jsx": React.createElement, "jsxs": React.createElement }`

**Response Handling**:

```typescript
const result = await reactFeedback.execute({...}, agent);

if (result.data.status === "accept") {
  console.log("Component accepted");
  if (result.data.comment) {
    console.log("User comment:", result.data.comment);
  }
} else {
  console.log("Component rejected");
  if (result.data.comment) {
    console.log("User comment:", result.data.comment);
  }
}
```

**Error Handling**:

- Throws error if `code` parameter is missing
- Cleanup errors are not explicitly caught (temporary directory is removed after file operations)

## Plugin Configuration

### Plugin Registration

The package automatically registers with Token Ring applications via the plugin system. The plugin implementation is in `plugin.ts` and registers all tools with the ChatService.

```typescript
import { TokenRingPlugin } from "@tokenring-ai/app";
import { ChatService } from "@tokenring-ai/chat";
import { z } from "zod";
import packageJSON from './package.json' with {type: 'json'};
import tools from "./tools.ts";

const packageConfigSchema = z.object({});

export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(app, config) {
    app.waitForService(ChatService, chatService =>
      chatService.addTools(tools)
    );
  },
  config: packageConfigSchema
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
```

### Configuration Schema

The package uses a minimal configuration schema that accepts no custom configuration options:

```typescript
const packageConfigSchema = z.object({});
```

### Required Services

The package requires the following services to be registered:

- **ChatService**: Required for tool registration
- **FileSystemService**: Required by `getFileFeedback` and `reactFeedback` tools for file operations
- **Agent**: Required for logging and service access

## Tools Export

### Tool Registration

Tools are registered via the plugin system when the package is installed:

```typescript
app.waitForService(ChatService, chatService =>
  chatService.addTools(tools)
);
```

Where `tools` is exported from `tools.ts`:

```typescript
import askQuestions from "./tools/askQuestions.ts";
import getFileFeedback from "./tools/getFileFeedback.js";
import reactFeedback from "./tools/react-feedback.js";

export default {
  askQuestions,
  getFileFeedback,
  reactFeedback,
};
```

Each tool follows the `TokenRingToolDefinition` pattern with:
- **name**: Internal tool name
- **displayName**: Formatted as "Category/ToolName"
- **description**: Detailed explanation of functionality
- **inputSchema**: Zod schema for validation
- **execute**: Async function that performs the tool's action

### Tool Interface

All tools export the following structure:

```typescript
export default {
  name: "tool_name",
  displayName: "Category/ToolName",
  description: "Tool description",
  inputSchema: z.object({ ... }),
  execute: async (params, agent) => { ... }
} satisfies TokenRingToolDefinition<typeof inputSchema>;
```

## Agent Configuration

The feedback package integrates with the Token Ring agent system through its tools. The tools expect an `Agent` instance to access services, logging, and human interaction capabilities.

### Required Services

The following services must be available for the tools to function:

- **ChatService**: Required for tool registration (handled by plugin)
- **FileSystemService**: Required by `getFileFeedback` and `reactFeedback` for file operations
- **Agent**: Required for logging, service access, and human interaction via `askQuestion` API

### Service Access Pattern

```typescript
import Agent from "@tokenring-ai/agent/Agent";
import { FileSystemService } from "@tokenring-ai/filesystem";

async function execute(params: unknown, agent: Agent) {
  // Access required services
  const fileSystem = agent.requireServiceByType(FileSystemService);
  
  // Use agent logging
  agent.infoMessage(`[tool-name] Operation started`);
  agent.infoMessage(`[tool-name] File review server running at ${url}`);
  agent.errorMessage(`[tool-name] Operation failed:`, error);
  
  // Use agent question API
  const response = await agent.askQuestion({...});
}
```

## Dependencies

### Runtime Dependencies

- `@tokenring-ai/app@0.2.0` - Base application framework
- `@tokenring-ai/chat@0.2.0` - Chat service
- `@tokenring-ai/agent@0.2.0` - Agent system and question schema
- `@tokenring-ai/filesystem@0.2.0` - File system service
- `zod@^4.3.6` - Schema validation
- `esbuild@^0.27.4` - React component bundling
- `esbuild-plugin-external-global@^1.0.1` - External global plugin for esbuild
- `express@^5.2.1` - Web server for preview
- `marked@^17.0.4` - Markdown rendering
- `date-fns@^4.1.0` - Date formatting
- `date-fns-tz@^3.2.0` - Time zone support
- `open@^11.0.0` - Browser launcher
- `react@^19.2.4` - React library (package dependency, but uses React 18 from CDN for browser previews)
- `react-dom@^19.2.4` - React DOM library (package dependency, but uses React DOM 18 from CDN for browser previews)

### Development Dependencies

- `typescript@^5.9.3` - TypeScript compiler
- `@types/express@^5.0.6` - Express type definitions
- `vitest@^4.1.0` - Testing framework

## Error Handling

All tools follow consistent error handling patterns:

### Parameter Validation

```typescript
// askQuestions: Validates that at least one question is provided
if (questionItems.size === 0) {
  return "You did not provide any questions, please provide at least one question to ask the user.";
}

// getFileFeedback: Validates filePath and content are provided
if (!filePath || !content) {
  throw new Error(
    `[feedback_getFileFeedback] filePath and content are required parameters for getFileFeedback.`
  );
}

// reactFeedback: Validates code is provided
if (!code) {
  throw new Error(`[feedback_react-feedback] code is required parameter for react-feedback.`);
}
```

### Graceful Failure

- Invalid input parameters: Throws errors with descriptive messages
- File system operations: Handle errors with logging without crashing
- Server startup: Log errors and fall back to URL reporting
- Cleanup errors:
  - `getFileFeedback`: Caught errors are logged but don't stop execution
  - `react-feedback`: Cleanup errors are not explicitly caught

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

- Uses `vitest` for testing
- Tests are located in `**/*.test.ts` files
- Node environment for test execution
- Isolated test runs with globals enabled

### Test Configuration

The package uses the following vitest configuration:

```typescript
import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    environment: "node",
    globals: true,
    isolate: true,
  },
});
```

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
  chatService.addTools(tools)
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

## Best Practices

### Using askQuestions

1. **Provide Clear Context**: Always include a descriptive message explaining why you need feedback
2. **Limit Question Count**: Ask focused questions to avoid overwhelming users
3. **Offer Meaningful Choices**: When providing choices, ensure they cover the main options
4. **Use Empty Choices**: For open-ended responses, use empty choices array to enable text input

### Using getFileFeedback

1. **Specify Content Type**: Always specify the correct `contentType` for proper rendering
2. **Provide Valid Paths**: Ensure `filePath` is valid and writable
3. **Handle Large Files**: For large files, consider summarizing or splitting content
4. **Use Markdown**: For code or documentation, use `text/markdown` for better readability

### Using react-feedback

1. **Include Dependencies**: Ensure all required imports are included in the code
2. **Keep Components Simple**: Focus on the component being reviewed, avoid complex dependencies
3. **Provide Filename**: Specify a meaningful filename for better organization
4. **Test Locally**: Verify the component works before submitting for feedback

## Testing and Development

### Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test:watch

# Run tests with coverage
bun test:coverage
```

### Package Structure for Testing

- Tests should be placed in `**/*.test.ts` files
- Use vitest for test assertions
- Mock agent and service dependencies
- Test each tool's execute function independently

### Development Workflow

1. Install dependencies: `bun install`
2. Make changes to tool implementations
3. Run tests: `bun test`
4. Build package: `bun run build`
5. Test integration with Token Ring applications

## Related Components

- **@tokenring-ai/agent**: Core agent system used for human interaction
- **@tokenring-ai/chat**: Chat service for tool registration
- **@tokenring-ai/filesystem**: File system service for file operations
- **@tokenring-ai/app**: Base application framework

## License

MIT License - see LICENSE file for details.
