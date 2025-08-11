export const name = "@token-ring/feedback" as const;
export const description = "A plugin for collecting feedback from users." as const;
export const version = "0.1.0" as const;

// Re-export types for tools; runtime uses index.ts re-exporting ./tools.ts
export * as tools from "./tools.js";
