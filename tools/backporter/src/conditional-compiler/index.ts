// Conditional Compiler - transforms nested 1.21.4+ selectors to 1.21.1 backport formats

export { ConditionalBackportCoordinator } from "./backport-coordinator";
export { BackportFileGenerator } from "./file-generator";
export { ConditionalPathExtractor } from "./path-extractor";
export { TargetSystemMapper } from "./target-mapper";

export interface ExecutionPath {
  conditions: {
    displayContext: string[];
    enchantment?: { type: string; level: number };
    component?: string;
  };
  targetModel: string;
  priority: number;
  isFallback: boolean;
}

export interface OutputTarget {
  type: "pommel" | "cit_property" | "base_texture" | "enhanced_model" | "preserve_3d_model";
  file: string;
  content: any;
  priority: number;
}
