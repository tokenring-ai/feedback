export function execute({ filePath, content, contentType }: {
    filePath: any;
    content: any;
    contentType?: string;
}, registry: any): Promise<{
    status: string;
    comment: any;
    filePath: any;
    rejectedFilePath: any;
}>;
export const description: "This tool allows you to present the content of a file to the user, solicit feedback (accept/reject with comments), and optionally write the content to a specified file path if accepted. If the `contentType` is `text/markdown` or `text/x-markdown`, the content will be rendered as HTML for review.";
export const parameters: z.ZodObject<{
    filePath: z.ZodString;
    content: z.ZodString;
    contentType: z.ZodDefault<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    filePath?: string;
    content?: string;
    contentType?: string;
}, {
    filePath?: string;
    content?: string;
    contentType?: string;
}>;
export default execute;
import { z } from "zod";
