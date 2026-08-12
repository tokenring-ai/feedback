import { format } from "date-fns";

/**
 * Build a Windows-safe rejected-file sibling path.
 * Inserts `.rejectedYYYYMMDD-HHmmss` before the final extension (or at the end if none).
 *
 * Examples:
 * - `docs/sample.md` → `docs/sample.rejected20240115-143022.md`
 * - `my.component.tsx` → `my.component.rejected20240115-143022.tsx`
 * - `README` → `README.rejected20240115-143022`
 */
export function toRejectedFilePath(filePath: string, now: Date = new Date()): string {
  // No colons — invalid on Windows filenames.
  const stamp = format(now, "yyyyMMdd-HHmmss");
  return filePath.replace(/(\.[^.]+)$|$/, `.rejected${stamp}$1`);
}
