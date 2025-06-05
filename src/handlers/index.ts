// Handler Strategy Interface

import type { WriteRequest, ProcessingContext } from '../file-manager';

export interface ItemHandler {
  name: string;
  canHandle(jsonNode: any, context: ProcessingContext): boolean;
  process(jsonNode: any, context: ProcessingContext): WriteRequest[];
}

import { DisplayContextHandler } from './display-context';
import { StoredEnchanmentsHandler } from './stored-enchantments';
import { WritableBookContentHandler } from './writable-book-content';
import { BaseItemHandler } from './base-item';

// Handler registry - will be populated as we migrate handlers
// Order matters: more specific handlers first, fallback handlers last
export const handlers: ItemHandler[] = [
  new StoredEnchanmentsHandler(),      // Highest priority - NBT-based items
  new WritableBookContentHandler(),    // High priority - book content logic  
  new DisplayContextHandler(),         // Medium priority - display context switching
  new BaseItemHandler()                // Lowest priority - fallback for everything else
];

export function registerHandler(handler: ItemHandler): void {
  handlers.push(handler);
}

export function getHandlers(): ItemHandler[] {
  return [...handlers];
}
