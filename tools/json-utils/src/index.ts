import { readFileSync, existsSync } from "node:fs";

export interface JsonValidationResult {
  isValid: boolean;
  data?: any;
  error?: string;
}

export async function validateJson(
  filePath: string
): Promise<JsonValidationResult> {
  if (!existsSync(filePath)) {
    return {
      isValid: false,
      error: "File does not exist",
    };
  }

  try {
    const content = readFileSync(filePath, "utf8");
    const data = JSON.parse(content);

    return {
      isValid: true,
      data,
    };
  } catch (error: any) {
    return {
      isValid: false,
      error: error.message || "Invalid JSON",
    };
  }
}

export function parseJsonSync(filePath: string): any {
  try {
    const content = readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse JSON from ${filePath}: ${error}`);
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
