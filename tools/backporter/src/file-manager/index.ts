// Write Request Types and FileManager Interface

export type MergeStrategy = "replace" | "merge-overrides" | "merge-properties" | "append";

export type WriteRequestContent = {
  parent?: string;
  textures?: Record<string, string>;
  overrides?: Array<{
    predicate: Record<string, number>;
    model: string;
  }>;
  [key: string]: unknown;
} | Record<string, string | number> | string;

export interface WriteRequest {
  type: "pommel-model" | "cit-properties" | "vanilla-model" | "texture-copy";
  path: string; // Relative path within output pack
  content: WriteRequestContent; // Type-specific content
  merge?: MergeStrategy; // How to handle conflicts
  priority?: number; // Higher priority wins conflicts (default: 0)
}

export interface ProcessingContext {
  itemId: string;
  itemPath: string;
  packStructure: ResourcePackStructure;
  outputDir: string;
}

// Import the existing type from introspection
export interface ResourcePackStructure {
  itemFiles: string[];
  modelFiles: string[];
  textureFiles: string[];
  textureDirectories: { [directory: string]: string[] };
  modelDirectories: { [directory: string]: string[] };
}

export interface FileManager {
  addRequests(requests: WriteRequest[]): void;
  writeAll(): Promise<void>;
  clear(): void;
}

export { FileManagerImpl } from "./manager";
