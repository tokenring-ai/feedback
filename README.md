# @tokenring-ai/feedback

## Overview

The `@tokenring-ai/feedback` package provides interactive tools for gathering
human input and reviewing agent proposals. It enables human-in-the-loop
interactions in AI-driven workflows by allowing AI agents to pause execution,
present information to users, and collect feedback through three mechanisms:

- Interactive chat-based questioning
- Browser-based file content review
- React component previews

## Key Features

- **Interactive Questioning**: Ask humans multiple questions via chat with
  support for text responses or multiple-choice options
- **File Content Review**: Display file contents (text, Markdown, HTML, JSON)
  in browser UIs for approval/reject with comments
- **React Component Preview**: Bundle and preview React components in browsers
  for visual feedback and approval
- **Seamless Integration**: Automatically registers with Token Ring applications
- **Auto-Cleanup**: Automatic cleanup of temporary files and directories
- **Type-Safe**: Full TypeScript support with Zod schema validation

## Installation

```bash
bun add @tokenring-ai/feedback
```

## Features

- Interactive chat-based questioning with form inputs
- Browser-based file content review with accept/reject functionality
- React component preview with bundling and rendering
- Support for multiple content types (plain text, Markdown, HTML, JSON)
- Automatic temporary file management and cleanup
- Integration with Token Ring agent system

## Tools

| Tool Name                    | Display Name               | Description                      |
|:-----------------------------|:---------------------------|:---------------------------------|
| `ask_questions`              | `Feedback/askQuestions`    | Ask questions via chat           |
| `feedback_getFileFeedback`   | `Feedback/getFileFeedback` | Get feedback on file content     |
| `feedback_react-feedback`    | `Feedback/react-feedback`  | Get feedback on React components |

### Feedback/askQuestions

**Tool Name**: `ask_questions`

**Description**: Ask questions to users via chat when feedback is necessary or
when uncertain about the proper path to complete a task. If there is uncertainty
about the task to be completed, or you are worried about doing something
incorrectly, use this tool, as it provides a strong guarantee that you are doing
things aligned with the users intents.

**Input Schema**:

```yaml
message: string - A free-form, paragraph sized message explaining the problem
  you are facing, or the uncertainty you have about the task
questions: array - Array of question objects
  - question: string - A question to ask the human
  - choices: string[] - Suggested choices for the human to select from.
    The human can choose from any of these options or provide their own response
```

**Example**:

```typescript
import askQuestions from "@tokenring-ai/feedback/tools/askQuestions";

const result = await askQuestions.execute({
  message: "I'm unsure about the approach to take for this refactoring.",
  questions: [
    {
      question: "Which refactoring method do you prefer?",
      choices: ["Extract to separate module", "Inline functions", "Keep as-is"]
    },
    {
      question: "Should we add tests before or after?",
      choices: [] // Freeform answer
    }
  ]
}, agent);
```

**Response Format**:

Returns a formatted string with user responses.

```text
The user has provided the following responses:

Which refactoring method do you prefer?
Extract to separate module

Should we add tests before or after?
After implementation
```

**Error Handling**:

- Throws error if user doesn't respond to question prompt
- Returns default message if user doesn't provide answer
- Validates that at least one question is provided
- Supports iterative questioning - continues until all questions are answered

---

### Feedback/getFileFeedback

**Tool Name**: `feedback_getFileFeedback`

**Description**: Present file content to the user for review, solicit feedback
(accept/reject with comments), and optionally write content to a file if
accepted. If the `contentType` is `text/markdown` or `text/x-markdown`, the
content will be rendered as HTML for review.

**Input Schema**:

```yaml
filePath: string - The path where the file content should be saved if accepted
content: string - The actual text content to be reviewed
contentType: string (optional) - The MIME type of the content.
  Defaults to 'text/plain'. Options:
  - 'text/plain': Plain text with HTML escaping
  - 'text/markdown' or 'text/x-markdown': Markdown rendered to HTML
  - 'text/html': Raw HTML content rendered in iframe
  - 'application/json': JSON formatted with HTML escaping
```

**Example**:

```typescript
import getFileFeedback from "@tokenring-ai/feedback/tools/getFileFeedback";

const result = await getFileFeedback.execute({
  filePath: "docs/sample.md",
  content: "# Sample\n\nThis is **bold** text and `code`.",
  contentType: "text/markdown"
}, agent);
```

**Response Format**:

Returns a JSON string with the following structure:

```json
{
  "status": "accepted" | "rejected",
  "comment": "optional user comment",
  "filePath": "path if accepted",
  "rejectedFilePath": "original filePath if rejected"
}
```

**Supported Content Types**:

| Content Type       | Rendering Method                             |
|:-------------------|:---------------------------------------------|
| `text/plain`       | Plain text with HTML escaping in `<pre>` tag |
| `text/markdown`    | Markdown rendered to HTML using marked.js    |
| `text/x-markdown`  | Markdown rendered to HTML using marked.js    |
| `text/html`        | Raw HTML in iframe                           |
| `application/json` | JSON with HTML escaping in `<pre>` tag       |

**Error Handling**:

- Throws error if `filePath` or `content` parameters are missing
- Cleanup errors are logged but don't stop execution
- Server startup errors are logged with fallback URL reporting
- Rejected files are saved with `.rejected` prefix and timestamp

---

### Feedback/react-feedback

**Tool Name**: `feedback_react-feedback`

**Description**: Show a React component in a browser window for user feedback,
allowing accept/reject with optional comments. The component is bundled using
esbuild and rendered with React 18 from CDN.

**Input Schema**:

```yaml
code: string - The complete source code of the React component.
  This should be valid JSX/TSX that can be bundled and rendered in the browser
file: string (optional) - The filename/path of the React component to be previewed
```

**Example**:

```typescript
import reactFeedback from "@tokenring-ai/feedback/tools/react-feedback";

const result = await reactFeedback.execute({
  code: `
    export default function MyComponent() {
      return (
        <div style={{ padding: '20px' }}>
          <h1>Hello, Feedback!</h1>
          <p>This is a React component preview.</p>
        </div>
      );
    }
  `,
  file: "src/components/MyComponent.tsx"
}, agent);
```

**Response Format**:

Returns a JSON string with the following structure:

```json
// Accepted
{ "status": "accept", "comment": "optional comment" }

// Rejected
{ "status": "reject", "comment": "optional comment" }
```

**Technical Details**:

- Components are bundled using esbuild with JSX automatic transformation
- React and React DOM are loaded from unpkg CDN (version 18)
- External dependencies (react, react-dom) are treated as global variables
- Components must export a default function component
- Temporary files are automatically cleaned up after feedback is received

**Error Handling**:

- Throws error if `code` parameter is missing
- Cleanup is performed after file operations
- Server is stopped after cleanup
- Rejected files are saved with `.rejected` prefix and timestamp

## Configuration

The package uses a minimal configuration schema that accepts no custom
configuration options.

### Plugin Registration

```typescript
import TokenRingApp from "@tokenring-ai/app";
import feedbackPlugin from "@tokenring-ai/feedback/plugin";

const app = new TokenRingApp();
app.install(feedbackPlugin);

// Tools are now available via the chat service
```

The plugin automatically registers all tools with the ChatService upon installation.

### Environment Variables

This package does not require any environment variables.

### Required Services

- **ChatService**: Required for tool registration (handled by plugin)
- **FileSystemService**: Required by `getFileFeedback` and `reactFeedback`
- **Agent**: Required for logging and service access

## Dependencies

### Runtime Dependencies

- `@tokenring-ai/app` - Base application framework
- `@tokenring-ai/chat` - Chat service
- `@tokenring-ai/agent` - Agent system and question schema
- `@tokenring-ai/filesystem` - File system service
- `@tokenring-ai/utility` - Utility functions
- `zod` - Schema validation
- `esbuild` - React component bundling
- `esbuild-plugin-external-global` - ESBuild plugin for external globals
- `express` - Web server for preview
- `marked` - Markdown rendering
- `date-fns` - Date formatting
- `open` - Browser launcher

### Development Dependencies

- `typescript` - TypeScript compiler
- `@types/express` - Express type definitions
- `vitest` - Testing framework

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

## License

MIT License - see LICENSE file for details.
