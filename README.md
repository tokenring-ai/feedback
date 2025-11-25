# @tokenring-ai/feedback

A comprehensive feedback collection package for the Token Ring AI framework, enabling AI agents to solicit and collect feedback from human users through various interactive methods.

## Overview

The `@tokenring-ai/feedback` package provides essential tools for human-in-the-loop interactions in AI-driven workflows. It allows AI agents to pause execution, present information to users, and collect feedback through browser-based interfaces or chat interactions.

### Key Features

- **Human Questioning**: Ask humans open-ended questions or present multiple-choice options via chat
- **File Content Review**: Display file contents (text, Markdown, HTML, JSON) in browser UIs for approval/rejection with comments
- **React Component Preview**: Render and preview React components in browsers for visual feedback
- **Seamless Integration**: Works with the Token Ring AI ecosystem and FileSystemService
- **Safe Handling**: Automatic cleanup of temporary files and secure isolation

## Installation

```bash
npm install @tokenring-ai/feedback
```

### Development Setup

```bash
# Install development dependencies
npm install --save-dev typescript @types/express

# Build the TypeScript code
npm run build
```

## Package Structure

```
pkg/feedback/
├── index.ts              # Main entry point and plugin registration
├── tools.ts              # Tool exports
├── tools/                # Core feedback tools
│   ├── askHuman.ts       # Human questioning via chat
│   ├── getFileFeedback.ts # File content browser review
│   └── react-feedback.ts # React component preview
├── package.json          # Package metadata and dependencies
├── tsconfig.json         # TypeScript configuration
└── README.md             # This documentation
```

## Usage

The package integrates with Token Ring AI applications as a plugin. Tools are automatically registered with the chat service when installed.

### Basic Integration

```typescript
import TokenRingApp from "@tokenring-ai/app";
import feedback from "@tokenring-ai/feedback";

const app = new TokenRingApp();
app.install(feedback);
```

## API Reference

### askHuman Tool

**Purpose**: Ask humans questions via chat interface with support for text or multiple-choice responses.

```typescript
import { askHuman } from "@tokenring-ai/feedback/tools/askHuman.js";

// Ask an open-ended question
const result = await askHuman.execute(
  {
    question: "What improvements would you suggest for this feature?"
  },
  agent
);

// Ask a multiple-choice question
const result = await askHuman.execute(
  {
    question: "Which option do you prefer?",
    choices: ["Option A", "Option B", "Option C"],
    response_type: "multiple"
  },
  agent
);
```

**Parameters**:
- `question` (string, required): The question to ask the human
- `choices` (string[], optional): List of choices for selection
- `response_type` ('text' | 'single' | 'multiple', optional): Expected response type

**Returns**: `AskHumanResult` object with status, question, timestamp, and message

### getFileFeedback Tool

**Purpose**: Present file content in a browser-based UI for human review and feedback.

```typescript
import { getFileFeedback } from "@tokenring-ai/feedback/tools/getFileFeedback.js";

// Review Markdown content
const result = await getFileFeedback.execute(
  {
    filePath: "docs/sample.md",
    content: "# Sample Markdown\nThis is **bold** text.",
    contentType: "text/markdown"
  },
  agent
);

// Review JSON content
const result = await getFileFeedback.execute(
  {
    filePath: "config/settings.json",
    content: JSON.stringify({ theme: "dark", language: "en" }, null, 2),
    contentType: "application/json"
  },
  agent
);
```

**Parameters**:
- `filePath` (string, required): Target path for accepted content
- `content` (string, required): File content to review
- `contentType` (string, optional): MIME type ('text/plain' default)

**Supported Content Types**:
- `text/plain`: Plain text display
- `text/markdown`, `text/x-markdown`: Markdown rendering with marked.js
- `text/html`: HTML content in iframe
- `application/json`: JSON with syntax highlighting

**Returns**: `GetFileFeedbackResult` with acceptance status and file paths

### react-feedback Tool

**Purpose**: Bundle and preview React components in browsers for visual feedback.

```typescript
import { reactFeedback } from "@tokenring-ai/feedback/tools/react-feedback.js";

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

const result = await reactFeedback.execute(
  {
    code: jsxCode,
    file: "src/components/MyComponent.tsx"
  },
  agent
);
```

**Parameters**:
- `code` (string, required): JSX/TSX code to preview
- `file` (string, optional): Target file path (auto-generated if not provided)

**Returns**: `ReactFeedbackResult` with acceptance status and optional comments

## Dependencies

### Runtime Dependencies
- `@tokenring-ai/agent@0.1.0` - Core agent functionality
- `@tokenring-ai/filesystem@0.1.0` - File system operations
- `express@^5.1.0` - Web server for browser-based tools
- `esbuild@^0.27.0` - JavaScript bundling for React components
- `esbuild-plugin-external-global@^1.0.1` - External global plugin
- `marked@^17.0.1` - Markdown rendering
- `date-fns@^4.1.0` - Date formatting
- `date-fns-tz@^3.2.0` - Timezone support
- `open@^11.0.0` - Browser opening
- `react@^19.2.0` - React framework
- `react-dom@^19.2.0` - React DOM

### Development Dependencies
- `typescript@^5.9.3` - TypeScript compiler
- `@types/express@^5.0.5` - Express type definitions

## Configuration

### TypeScript Configuration

The package uses TypeScript with the following settings:
- Target: ES2022
- Module: NodeNext
- Strict mode enabled
- ES module resolution

### Build Configuration

```bash
npm run build
```

This compiles TypeScript files to JavaScript using the configured `tsconfig.json`.

## Error Handling

All tools throw exceptions for invalid inputs. Implement proper error handling in your agent code:

```typescript
try {
  const result = await getFileFeedback.execute(params, agent);
  // Handle successful result
} catch (error) {
  console.error('Feedback collection failed:', error.message);
  // Handle error appropriately
}
```

## Limitations and Considerations

1. **Browser Requirements**: Browser-based tools require a graphical environment
2. **Open Command**: The `open` command may fail in headless environments (falls back to URL logging)
3. **Development CDNs**: React previews use development CDN scripts; production use not supported
4. **File Types**: Focus on text-based content; binary files not handled
5. **Security**: Temporary files are automatically cleaned up, but ensure no sensitive data exposure
6. **Network Access**: Browser tools require network access for preview servers

## Contributing

### Development Guidelines

- Follow TypeScript strict mode
- Update Zod schemas for new parameters
- Ensure proper error handling and logging
- Test in various environments
- Maintain compatibility with Token Ring AI ecosystem

### Building and Testing

```bash
# Build the package
npm run build

# Run tests (if available)
npm test
```

## License

MIT License - see LICENSE file for details.

## Support

For issues, questions, or contributions, please refer to the main Token Ring AI repository guidelines and issue tracker.