export function execute({ file, code }: {
    file: any;
    code: any;
}, registry: any): Promise<any>;
/**
 * Render & review a React component in the browser.
 * @param {object} args Tool arguments: { file: string, code: string, exampleProps: object }
 * @param {TokenRingRegistry} registry - The package registry
 */
export const description: "This tool lets you solicit feedback from the user, by opening a browser window, where you can show them an HTML document (formatted in jsx, to be rendered via react), and then allows them to accept or reject the document, and optionally add comments, which are then returned to you as a result.";
export const parameters: z.ZodObject<{
    code: z.ZodString;
    file: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    code?: string;
    file?: string;
}, {
    code?: string;
    file?: string;
}>;
export default execute;
import { z } from "zod";
