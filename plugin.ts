import type { TokenRingPlugin } from "@tokenring-ai/app";
import { ChatService } from "@tokenring-ai/chat";
import { WebHostService } from "@tokenring-ai/web-host/index.ts";
import FeedbackResource from "./FeedbackResource.ts";
import FeedbackService from "./FeedbackService.ts";
import packageJSON from "./package.json" with { type: "json" };

import tools from "./tools.ts";

export default {
  name: packageJSON.name,
  displayName: "Human Feedback",
  version: packageJSON.version,
  description: packageJSON.description,
  install(app) {
    const feedbackService = app.addService(new FeedbackService());

    app.waitForService(ChatService, chatService => chatService.addTools(tools));

    app.services.waitForItemByType(WebHostService, webHostService => {
      webHostService.registerResource("feedback", new FeedbackResource(feedbackService));
    });
  },
} satisfies TokenRingPlugin;
