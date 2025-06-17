// Coordination - orchestrates the backport process

export interface BackportOptions {
  verbose?: boolean;
}

export { BackportCoordinator } from "./processor";

// Re-export types that coordination owns
export interface BackportOptions {
  inputDir: string;
  outputDir: string;
  clearOutput?: boolean;
  verbose?: boolean;
}
