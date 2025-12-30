import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import {z} from "zod";

/**
 * Allows the AI to ask the human a question about the current task.
 */
const name = "feedback_askHuman";

const description =
  "This tool allows the AI to ask the human a question about the current task and receive their response. It supports textual answers, as well as single-choice and multiple-choice questions when options are provided. Use the 'response_type' parameter ('text', 'single', 'multiple') to specify the expected type of response.";

const inputSchema = z.object({
  question: z.string().describe("The question to ask the human."),
  choices: z
    .array(z.string())
    .describe(
      "A list of choices for the human to select from. Required if response_type is 'single' or 'multiple'.",
    )
    .optional(),
  response_type: z
    .enum(["text", "single", "multiple"]) // removed stray backslash
    .describe(
      "Specifies the expected type of response. Defaults to 'text' if choices are absent, and 'single' if choices are present.",
    )
    .optional(),
});

interface AskHumanBase {
  question: string;
  response_type: "text" | "single" | "multiple";
  timestamp: string;
  message: string;
}

export interface AskHumanTextResult extends AskHumanBase {
  status: "question_asked_text";
}

export interface AskHumanChoicesResult extends AskHumanBase {
  status: "question_asked_choices";
  choices: string[];
}

export type AskHumanResult = AskHumanTextResult | AskHumanChoicesResult;

/**
 * Executes the askHuman tool.
 * Returns a result object. Errors are thrown as exceptions.
 */
async function execute(
  args: z.infer<typeof inputSchema>,
  agent: Agent,
): Promise<AskHumanResult> {
  const {question, choices, response_type: argResponseType} = args;

  // Validate required question parameter
  if (!question) {
    throw new Error(`[${name}] Question is required.`);
  }

  let finalResponseType = argResponseType;

  if (choices && choices.length > 0) {
    // If choices are provided and no explicit response_type, default to "single"
    if (!finalResponseType) {
      finalResponseType = "single";
    }

    // Build the message with a consistent prefix
    let message = `[${name}] AI is asking: ${question}\n`;
    if (finalResponseType === "multiple") {
      message += "Please select one or more applicable options.\n";
    } else {
      message += "Please select one of the following options:\n";
    }
    choices.forEach((choice, index) => {
      message += `${index + 1}. ${choice}\n`;
    });
    agent.infoLine(message);

    return {
      status: "question_asked_choices",
      question,
      choices,
      response_type: finalResponseType,
      timestamp: new Date().toISOString(),
      message: `The question with choices has been asked to the human. Respond in the chat according to the options and type (${finalResponseType}).`,
    };
  } else {
    // No choices provided
    if (!finalResponseType) {
      finalResponseType = "text";
    }
    agent.infoLine(`[${name}] AI is asking: ${question}`);
    return {
      status: "question_asked_text",
      question,
      response_type: finalResponseType,
      timestamp: new Date().toISOString(),
      message: "The question has been asked to the human. Please provide your textual response in the chat.",
    };
  }
}

export default {
  name, description, inputSchema, execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;