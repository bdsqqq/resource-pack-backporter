// Handler Strategy Interface

import type { ProcessingContext, WriteRequest } from "@backporter/file-manager";

// Type for JSON nodes that we can safely process
export type JsonNode = {
  [key: string]: unknown;
};

export interface ItemHandler {
  name: string;
  canHandle(jsonNode: JsonNode, context: ProcessingContext): boolean;
  process(jsonNode: JsonNode, context: ProcessingContext): WriteRequest[];
}

import { BaseItemHandler } from "./base-item";
import { DisplayContextHandler } from "./display-context";
import { StoredEnchanmentsHandler } from "./stored-enchantments";
import { WritableBookContentHandler } from "./writable-book-content";

// Handler registry - will be populated as we migrate handlers
// Order matters: more specific handlers first, fallback handlers last
export const handlers: ItemHandler[] = [
  new StoredEnchanmentsHandler(), // Highest priority - NBT-based items
  new WritableBookContentHandler(), // High priority - book content logic
  new DisplayContextHandler(), // Medium priority - display context switching
  new BaseItemHandler(), // Lowest priority - fallback for everything else
];

export function registerHandler(handler: ItemHandler): void {
  handlers.push(handler);
}

export function getHandlers(): ItemHandler[] {
  return [...handlers];
}
