import Agent from "@tokenring-ai/agent/Agent";
import {TextQuestionSchema, type TreeSelectQuestionSchema} from "@tokenring-ai/agent/question";
import {TokenRingToolDefinition, type TokenRingToolTextResult} from "@tokenring-ai/chat/schema";
import {z} from "zod";

/**
 * Allows the AI to ask the user a question about the current task.
 */
const name = "ask_questions";
const displayName = "Feedback/askQuestions";

const description =
  "The ask_questions tool is to be called when feedback from the user is necessary, or when you are unsure or uncertain about the proper path to take, " +
  "or are unsure about how to complete the task the user has given.\n" +
  "If there is uncertainty about the task to be completed, or you are worried about doing something incorrectly, " +
  "use this tool, as it provides a strong guarantee that you are doing things aligned with the users intents.\n" +
  "You can ask one or more questions, and you can also provide choices for the user to choose from for each one.\n" +
  "The user will either pick one of these choices, or respond with their own answer if none of the options are aligned with their intent.";

const inputSchema = z.object({
  message: z.string().describe("A free-form, paragraph sized message, explaining the problem you are facing, or the uncertainty you have about the task."),
  questions: z.array(z.object({
    question: z.string().describe("A question to ask the human, such as something to clarify, or to get additional information on."),
    choices: z
      .array(z.string())
      .describe("Suggested choices for the human to select from. The human can choose from any of these options or provide their own response.")
  }))
});

/**
 * Executes the askQuestion tool.
 * Returns a result object. Errors are thrown as exceptions.
 */
async function execute(
  { message, questions}: z.output<typeof inputSchema>,
  agent: Agent,
): Promise<TokenRingToolTextResult> {
  const questionItems = new Map<string,z.input<typeof TreeSelectQuestionSchema> | z.input<typeof TextQuestionSchema>>()

  for (const question of questions) {
    if (question.choices.length > 0) {
      questionItems.set(question.question, {
        type: 'treeSelect',
        label: question.question,
        minimumSelections: 1,
        maximumSelections: 1,
        defaultValue: ['__other__'],
        tree: [
          ...question.choices.map(choice => ({
            name: choice, value: choice
          })),
          {
            name: "Other (Will open a text box for a freeform answer)", value: '__other__'
          }
        ],
      })
    } else {
      questionItems.set(question.question, {
        type: 'text',
        label: question.question,
        defaultValue: "The user did not provider an answer, use your own judgement",
      });
    }
  }

  if (questionItems.size === 0) {
    return "You did not provide any questions, please provide at least one question to ask the user.";
  }

  const completeResults: Record<string, string> = {};

  do {
    const result = await agent.askQuestion({
      message,
      question: {
        type: 'form',
        sections: [{
          name: 'Questions',
          fields: Object.fromEntries(questionItems.entries())
        }]
      }
    });

    for (let [question, answer] of Object.entries(result.Questions)) {
      if (answer === null) {
        completeResults[question] = "The user did not provide an answer, use your own judgement";
        questionItems.delete(question);
      } else {
        answer = Array.isArray(answer) ? answer[0] : answer;

        if (answer === "__other__") {
          const item = questionItems.get(question);
          questionItems.set(question, {
            type: 'text',
            label: item!.label,
            defaultValue: "The user did not provider an answer, use your own judgement",
          });
        } else {
          completeResults[question] = answer;
          questionItems.delete(question);
        }
      }
    }
/*
    agent.infoMessage(JSON.stringify(completeResults));
    agent.infoMessage(JSON.stringify(result));
    agent.infoMessage(JSON.stringify(Object.fromEntries(questionItems.entries())));
    await new Promise(resolve => setTimeout(resolve, 60000));*/
  } while (questionItems.size > 0);

  return `The user has provided the following responses:\n${
    Object.entries(completeResults).map(([question, answer]) => `${question}\n${answer}`).join('\n\n')
  }`;

}

export default {
  name, displayName, description, inputSchema, execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
