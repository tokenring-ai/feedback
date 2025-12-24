# @tokenring-ai/feedback

A comprehensive feedback collection package for the Token Ring AI framework, enabling AI agents to solicit and collect feedback from human users through various interactive methods.

## Overview

The `@tokenring-ai/feedback` package provides essential tools for human-in-the-loop interactions in AI-driven workflows. It allows AI agents to pause execution, present information to users, and collect feedback through browser-based interfaces or chat interactions.

### Key Features

- **Human Questioning**: Ask humans open-ended questions or present multiple-choice options via chat
- **File Content Review**: Display file contents (text, Markdown, HTML, JSON) in browser UIs for approval/rejection with comments
- **React Component Preview**: Bundle and preview React components in browsers for visual feedback
- **Seamless Integration**: Automatically registers with Token Ring applications via plugin system
- **Safe Handling**: Automatic cleanup of temporary files and secure isolation
- **Type-Safe**: Full TypeScript support with Zod schema validation
- **Browser Preview**: Uses Express servers for local preview with automatic cleanup
- **Bundling Support**: ESBuild integration for React component bundling

## Installation

```bash
bun install @tokenring-ai/feedback
```

## Package Structure

```
pkg/feedback/
├── index.ts              # Main entry point (empty)
├── plugin.ts             # Plugin registration with Token Ring
├── tools.ts              # Tool exports aggregator
├── tools/                # Core feedback tools
│   ├── askHuman.ts       # Human questioning via chat
│   ├── getFileFeedback.ts # File content browser review
│   └── react-feedback.ts # React component preview
├── package.json          # Package metadata and dependencies
├── vitest.config.ts      # Testing configuration
└── README.md             # This documentation
```

## Usage

### Plugin Integration

The package integrates with Token Ring applications as a plugin. Tools are automatically registered with the chat service when installed.

```typescript
import TokenRingApp from "@tokenring-ai/app";
import feedbackPlugin from "@tokenring-ai/feedback/plugin";

const app = new TokenRingApp();
app.install(feedbackPlugin);

// Tools are now available via the chat service
// Use: /feedback/askHuman, /feedback/getFileFeedback, /feedback/react-feedback
```

### Direct Tool Usage

Tools can be used directly in agent code:

```typescript
import { askHuman } from "@tokenring-ai/feedback/tools/askHuman";
import { getFileFeedback } from "@tokenring-ai/feedback/tools/getFileFeedback";
import { reactFeedback } from "@tokenring-ai/feedback/tools/react-feedback";

class MyAgent {
  async handleFeedback() {
    // Ask a question via chat
    const question = await askHuman.execute({
      question: "What improvements would you suggest?",
      response_type: "text"
    }, this);
    
    // Review file content
    const fileReview = await getFileFeedback.execute({
      filePath: "docs/sample.md",
      content: "# Sample Document\nThis needs your approval.",
      contentType: "text/markdown"
    }, this);
    
    // Preview React component
    const componentCode = `
      import React from 'react';
      export default function MyComponent() {
        return <div>Hello World</div>;
      }
    `;
    const componentPreview = await reactFeedback.execute({
      code: componentCode,
      file: "src/components/MyComponent.tsx"
    }, this);
  }
}
```

## API Reference

### askHuman Tool

**Tool Name**: `feedback/askHuman`

**Purpose**: Ask humans questions via chat interface with support for text or multiple-choice responses.

**Input Schema** (Zod):

```typescript
{
  question: string,           // Required: The question to ask
  choices?: string[],         // Optional: List of choices for selection
  response_type?: "text" | "single" | "multiple"  // Optional: Response type
}
```

**Example Usage**:

```typescript
// Ask an open-ended question
const result = await askHuman.execute({
  question: "What improvements would you suggest for this feature?"
}, agent);

// Ask a multiple-choice question
const result = await askHuman.execute({
  question: "Which option do you prefer?",
  choices: ["Option A", "Option B", "Option C"],
  response_type: "single"
}, agent);

// Ask for multiple selections
const result = await askHuman.execute({
  question: "Which features are most important?",
  choices: ["Performance", "Usability", "Reliability", "Cost"],
  response_type: "multiple"
}, agent);
```

**Response Types**:
- `AskHumanTextResult`: `{ status: "question_asked_text", question, response_type, timestamp, message }`
- `AskHumanChoicesResult`: `{ status: "question_asked_choices", question, choices, response_type, timestamp, message }`

**Error Handling**: Throws exceptions for missing required parameters (e.g., empty question)

### getFileFeedback Tool

**Tool Name**: `feedback/getFileFeedback`

**Purpose**: Present file content in a browser-based UI for human review and feedback.

**Input Schema** (Zod):

```typescript
{
  filePath: string,          // Required: Target path for accepted content
  content: string,           // Required: File content to review
  contentType?: string       // Optional: MIME type (default: "text/plain")
}
```

**Supported Content Types**:
- `text/plain`: Plain text display with syntax highlighting
- `text/markdown`, `text/x-markdown`: Markdown rendering with marked.js
- `text/html`: HTML content in iframe
- `application/json`: JSON with syntax highlighting

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
- Creates temporary directory for preview
- Spins up Express server for browser interface
- Automatically opens browser (falls back to URL logging)
- Handles user acceptance/rejection with comments
- Cleans up temporary files automatically

### react-feedback Tool

**Tool Name**: `feedback/react-feedback`

**Purpose**: Bundle and preview React components in browsers for visual feedback.

**Input Schema** (Zod):

```typescript
{
  code: string,              // Required: JSX/TSX code to preview
  file?: string              // Optional: Target file path (auto-generated if not provided)
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

```typescript
{
  status: "accept" | "reject" | "rejected",
  comment?: string           // User's optional comment
}
```

**Implementation Details**:
- Uses esbuild for bundling React components
- Bundles with external React CDN imports
- Creates Express server for preview
- Supports JSX/TSX with automatic JSX transformation
- Handles global React imports properly

## Configuration

### Plugin Configuration

The package automatically registers with Token Ring applications:

```typescript
// In plugin.ts
export default {
  name: "@tokenring-ai/feedback",
  version: "0.2.0",
  description: "Feedback package for Token Ring",
  install(app: TokenRingApp) {
    app.waitForService(ChatService, chatService =>
      chatService.addTools(packageJSON.name, tools)
    );
  },
} satisfies TokenRingPlugin;
```

### TypeScript Configuration

The package uses TypeScript with the following settings:
- Target: ES2022
- Module: NodeNext
- Strict mode enabled
- ES module resolution

## Dependencies

### Runtime Dependencies
- `@tokenring-ai/agent@0.2.0` - Core agent functionality
- `@tokenring-ai/chat@0.2.0` - Chat service integration
- `@tokenring-ai/filesystem@0.2.0` - File system operations
- `@tokenring-ai/app@0.2.0` - Application framework
- `zod@catalog:` - Schema validation
- `express@^5.2.1` - Web server for browser-based tools
- `esbuild@^0.27.1` - JavaScript bundling for React components
- `esbuild-plugin-external-global@^1.0.1` - External global plugin
- `marked@^17.0.1` - Markdown rendering
- `date-fns@^4.1.0` - Date formatting
- `date-fns-tz@^3.2.0` - Timezone support
- `open@^11.0.0` - Browser opening
- `react@catalog:` - React framework
- `react-dom@catalog:` - React DOM

### Development Dependencies
- `typescript@catalog:` - TypeScript compiler
- `@types/express@^5.0.6` - Express type definitions
- `vitest@catalog:` - Testing framework

## Error Handling

All tools follow consistent error handling patterns:

```typescript
// Parameter validation with Zod schemas
if (!question) {
  throw new Error(`[feedback/askHuman] Question is required.`);
}

// Proper error messages
if (!filePath || !content) {
  throw new Error(
    `[feedback/getFileFeedback] filePath and content are required parameters.`
  );
}

// Agent integration with error propagation
try {
  const result = await tool.execute(params, agent);
  return result;
} catch (error) {
  agent.errorLine(`[tool-name] Operation failed:`, error);
  throw error;
}
```

### Error Types

1. **Validation Errors**: Missing required parameters or invalid input types
2. **File System Errors**: File I/O operations, permissions, path validation
3. **Network Errors**: Server startup, browser launch, HTTP requests
4. **Build Errors**: React component bundling failures
5. **Agent Errors**: Service integration issues

## Integration Patterns

### Agent Integration

Tools integrate with agents through the service system:

```typescript
// Access required services
const fileSystem = agent.requireServiceByType(FileSystemService);

// Use agent logging methods
agent.infoLine(`[tool-name] Operation started`);
agent.errorLine(`[tool-name] Operation failed:`, error);
```

### Service Dependencies

- **FileSystemService**: Required for file operations
- **ChatService**: Required for tool registration
- **Agent**: Required for logging and service access

### State Management

Tools maintain minimal state:
- Temporary files are cleaned up automatically
- No persistent state between executions
- Browser sessions are ephemeral

## Limitations and Considerations

### Browser Requirements
- Browser-based tools require a graphical environment
- Open command may fail in headless environments (falls back to URL logging)

### Security Considerations
- Temporary files are automatically cleaned up
- Preview servers run on localhost only
- No persistent storage of user data

### Performance Considerations
- React bundling uses esbuild (fast but limited features)
- Browser previews use development CDN scripts
- Not suitable for production React applications

### Content Support
- Focus on text-based content and React components
- Binary files not handled
- File size limits depend on browser and system constraints

### Network Requirements
- Browser tools require network access for preview servers
- React previews use external CDN resources
- Local server communication only

## Development

### Building and Testing

```bash
# Build the package
bun run build

# Run tests
bun run test

# Run tests with coverage
bun run test:coverage

# Run tests in watch mode
bun run test:watch
```

### Development Guidelines

- Follow TypeScript strict mode
- Update Zod schemas for new parameters
- Ensure proper error handling and logging
- Test in various environments
- Maintain compatibility with Token Ring AI ecosystem
- Use proper tool naming conventions (`feedback/toolName`)
- Implement proper cleanup for temporary resources

### Code Style

- Consistent tool naming: `feedback/toolName`
- Proper error messages with tool prefixes
- Async/await patterns throughout
- Proper TypeScript types and Zod validation
- Agent integration via service requirements

## License

MIT License - see LICENSE file for details.