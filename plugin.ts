import type { TokenRingPlugin } from "@tokenring-ai/app";
import { ChatService } from "@tokenring-ai/chat";
import packageJSON from "./package.json" with { type: "json" };

import tools from "./tools.ts";

export default {
  name: packageJSON.name,
  displayName: "Human Feedback",
  version: packageJSON.version,
  description: packageJSON.description,
  install(app) {
    app.waitForService(ChatService, chatService => chatService.addTools(tools));
  },
} satisfies TokenRingPlugin;
