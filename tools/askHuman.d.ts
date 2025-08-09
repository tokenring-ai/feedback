export function execute(args: any, registry: any): Promise<{
    status: string;
    question: any;
    choices: any[];
    response_type: any;
    timestamp: string;
    message: string;
} | {
    status: string;
    question: any;
    response_type: any;
    timestamp: string;
    message: string;
    choices?: undefined;
}>;
/**
 * Allows the AI to ask the human a question about the current task.
 * @param {object} args Tool arguments: { question: string, choices?: string[], response_type?: "text" | "single" | "multiple" }
 * @param {TokenRingRegistry} registry - The package registry
 */
export const description: "This tool allows the AI to ask the human a question about the current task and receive their response. It supports textual answers, as well as single-choice and multiple-choice questions when options are provided. Use the 'response_type' parameter ('text', 'single', 'multiple') to specify the expected answer format.";
export const parameters: z.ZodObject<{
    question: z.ZodString;
    choices: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    response_type: z.ZodOptional<z.ZodEnum<["text", "single", "multiple"]>>;
}, "strip", z.ZodTypeAny, {
    question?: string;
    choices?: string[];
    response_type?: "text" | "single" | "multiple";
}, {
    question?: string;
    choices?: string[];
    response_type?: "text" | "single" | "multiple";
}>;
export default execute;
import { z } from "zod";
