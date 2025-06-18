import { readFile } from "node:fs/promises";
import { err, ok, type Result } from "neverthrow";

export interface ValidationResult {
  isValid: boolean;
  data?: unknown;
  error?: string;
  line?: number;
  column?: number;
}

export async function validateJson(filePath: string): Promise<Result<ValidationResult, string>> {
  try {
    const content = await readFile(filePath, "utf-8");

    try {
      const data = JSON.parse(content);
      return ok({
        isValid: true,
        data,
      });
    } catch (parseError: unknown) {
      // Extract line/column info from JSON parse error if available
      const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
      const match = errorMessage.match(/at position (\d+)/);
      let line: number | undefined;
      let column: number | undefined;

      if (match?.[1]) {
        const position = Number.parseInt(match[1], 10);
        const lines = content.substring(0, position).split("\n");
        line = lines.length;
        const lastLine = lines[lines.length - 1];
        column = lastLine ? lastLine.length + 1 : 1;
      }

      return ok({
        isValid: false,
        error: errorMessage,
        line,
        column,
      });
    }
  } catch (fileError: unknown) {
    const message = fileError instanceof Error ? fileError.message : String(fileError);
    return err(`Failed to read file ${filePath}: ${message}`);
  }
}

export function isValidJson(content: string): boolean {
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}
