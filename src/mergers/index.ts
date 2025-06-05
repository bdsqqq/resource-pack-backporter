// Merger Strategy Interface

import type { WriteRequest } from '../file-manager';

export interface RequestMerger {
  name: string;
  canMerge(requests: WriteRequest[]): boolean;
  merge(requests: WriteRequest[]): WriteRequest;
}

import { OverridesMerger } from './overrides';

// Merger registry - will be populated as we implement mergers
export const mergers: RequestMerger[] = [
  new OverridesMerger()
];

export function registerMerger(merger: RequestMerger): void {
  mergers.push(merger);
}

export function getMergers(): RequestMerger[] {
  return [...mergers];
}
