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
  in browser UIs for approval/rejection with comments
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

| Tool Name | Display Name | Description |
| :--- | :--- | :--- |
| `ask_questions` | `Feedback/askQuestions` | Ask questions via chat |
| `feedback_getFileFeedback` | `Feedback/getFileFeedback` | Get feedback on file content |
| `feedback_react-feedback` | `Feedback/react-feedback` | Get feedback on React components |

### Feedback/askQuestions

**Tool Name**: `ask_questions`

**Description**: Ask questions to users via chat when feedback is necessary or
when uncertain about the proper path to complete a task.

**Input Schema**:

```yaml
message: string - Free-form message explaining the problem
questions: array - Array of question objects
  - question: string - The specific question to ask
  - choices: string[] - Suggested choices (empty for freeform)
```

**Example**:

```typescript
import askQuestions from "@tokenring-ai/feedback/tools/askQuestions";

const result = await askQuestions.execute({
  message: "I'm unsure about the approach.",
  questions: [
    {
      question: "Which method do you prefer?",
      choices: ["Method A", "Method B", "Method C"]
    }
  ]
}, agent);
```

**Response Format**:

Returns a formatted string with user responses.

```text
The user has provided the following responses:

Question 1
Answer 1

Question 2
Answer 2
```

**Error Handling**:

- Throws error if user doesn't respond to question prompt
- Returns default message if user doesn't provide answer
- Validates that at least one question is provided

---

### Feedback/getFileFeedback

**Tool Name**: `feedback_getFileFeedback`

**Description**: Present file content to the user for review, solicit feedback
(accept/reject with comments), and optionally write content to a file if
accepted.

**Input Schema**:

```yaml
filePath: string - Path where content should be saved if accepted
content: string - The actual text content to be reviewed
contentType: string (optional) - MIME type, defaults to 'text/plain'
```

**Supported Content Types**:

- `text/plain`: Plain text with HTML escaping
- `text/markdown`: Markdown rendered to HTML using marked.js
- `text/html`: Raw HTML content rendered in iframe
- `application/json`: JSON formatted with HTML escaping

**Example**:

```typescript
import getFileFeedback from "@tokenring-ai/feedback/tools/getFileFeedback";

const result = await getFileFeedback.execute({
  filePath: "docs/sample.md",
  content: "# Sample\nThis is **bold** text.",
  contentType: "text/markdown"
}, agent);
```

**Response Format**:

```typescript
{
  type: "json",
  data: {
    status: "accepted" | "rejected",
    comment?: string,
    filePath?: string,
    rejectedFilePath?: string
  }
}
```

**Error Handling**:

- Throws error if `filePath` or `content` parameters are missing
- Cleanup errors are logged but don't stop execution
- Server startup errors are logged with fallback URL reporting

---

### Feedback/react-feedback

**Tool Name**: `feedback_react-feedback`

**Description**: Show a React component in a browser window for user feedback,
allowing accept/reject with optional comments.

**Input Schema**:

```yaml
code: string - Complete source code of the React component (valid JSX/TSX)
file: string (optional) - Filename/path of the React component
```

**Example**:

```typescript
import reactFeedback from "@tokenring-ai/feedback/tools/react-feedback";

const result = await reactFeedback.execute({
  code: `
    export default function MyComponent() {
      return <div>Hello, Feedback!</div>;
    }
  `,
  file: "src/components/MyComponent.tsx"
}, agent);
```

**Response Format**:

```typescript
// Accepted
{ type: "json", data: { status: "accept", comment?: string } }

// Rejected
{ type: "json", data: { status: "reject", comment?: string } }
```

**Error Handling**:

- Throws error if `code` parameter is missing
- Cleanup is performed after file operations
- Server is stopped after cleanup

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

### Environment Variables

This package does not require any environment variables.

### Required Services

- **ChatService**: Required for tool registration (handled by plugin)
- **FileSystemService**: Required by `getFileFeedback` and `reactFeedback`
- **Agent**: Required for logging and service access

## Dependencies

### Runtime Dependencies

- `@tokenring-ai/app@0.2.0` - Base application framework
- `@tokenring-ai/chat@0.2.0` - Chat service
- `@tokenring-ai/agent@0.2.0` - Agent system and question schema
- `@tokenring-ai/filesystem@0.2.0` - File system service
- `zod@^4.3.6` - Schema validation
- `esbuild@^0.27.4` - React component bundling
- `express@^5.2.1` - Web server for preview
- `marked@^17.0.5` - Markdown rendering
- `date-fns@^4.1.0` - Date formatting
- `open@^11.0.0` - Browser launcher
- `react@^19.2.4` - React library
- `react-dom@^19.2.4` - React DOM library

### Development Dependencies

- `typescript@^6.0.2` - TypeScript compiler
- `@types/express@^5.0.6` - Express type definitions
- `vitest@^4.1.1` - Testing framework

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
