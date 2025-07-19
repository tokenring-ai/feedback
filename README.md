# @token-ring/tools-feedback

**Description**: A plugin for collecting feedback from users.

## Overview

This package provides a suite of tools designed to enable an AI agent to solicit and process human feedback on various artifacts, such as questions, React components, or general file content. These tools facilitate interactive review sessions by presenting information to the user and capturing their input (acceptance, rejection, and comments).

## Available Tools

Below is a list of tools available in this package, along with their descriptions and usage specifications.

### 1. `askHuman`

*   **Description**: Allows the AI to ask the human a question about the current task and receive their response.
*   **New Feature**: Supports multiple-choice questions. If a `choices` array (of strings) is provided in the arguments, the user will be presented with these choices and must select one as their response.
*   **Basic Usage/Spec**:
    ```json
    {
      "question": "string (required) - The question to ask the human.",
      "choices": "array of strings (optional) - A list of choices for the human to select from."
    }
    ```

### 2. `react-feedback`

*   **Description**: Lets you solicit feedback from the user on a React component by rendering it in a browser window. The user can then accept or reject the component, optionally adding comments.
*   **New Feature**: Supports the inclusion of external CSS files. Provide an array of CSS file URLs in the `externalCSS` argument to have them linked in the preview document.
*   **Basic Usage/Spec**:
    ```json
    {
      "code": "string (required) - The complete JSX/TSX source code of the React component.",
      "file": "string (optional) - The filename/path where the component code should be saved if the user accepts. Defaults to a generated name.",
      "externalCSS": "array of strings (optional) - An array of URLs to external CSS files to be included in the preview."
    }
    ```

### 3. `getFileFeedback`

*   **Description**: Allows the AI to present file content (e.g., plain text, HTML, JSON) to the user for review in the browser. The user can accept or reject the content with comments. If accepted, the content is written to the specified file path.
*   **Basic Usage/Spec**:
    ```json
    {
      "filePath": "string (required) - The path where the file content should be saved if accepted by the user.",
      "content": "string (required) - The actual text content to be reviewed.",
      "contentType": "string (optional) - The MIME type of the content (e.g., 'text/plain', 'text/html', 'application/json', 'text/markdown', 'text/x-markdown'). Defaults to 'text/plain'. This influences how the content is presented in the browser. If `contentType` is 'text/markdown' or 'text/x-markdown', the content is parsed and rendered as HTML for a rich preview experience."
    }
    ```

## Installation/Usage Notes

These tools are designed to be used within an environment that integrates with the `@token-ring` ecosystem and provides necessary services like `ChatService` and `FileSystem`. Ensure the host environment can support the browser-based interactions initiated by `react-feedback` and `getFileFeedback`.
