import {AgentTeam, TokenRingPackage} from "@tokenring-ai/agent";
import {ChatService} from "@tokenring-ai/chat";
import packageJSON from './package.json' with {type: 'json'};

import * as tools from "./tools.ts";

export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(agentTeam: AgentTeam) {
    agentTeam.waitForService(ChatService, chatService =>
      chatService.addTools(packageJSON.name, tools)
    );
  },
} as TokenRingPackage;
