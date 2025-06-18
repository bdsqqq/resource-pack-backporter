import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ResourcePackStructure } from "@backporter/file-manager";
import type { StructuredTracer } from "@logger/index";

export interface ComponentAnalysis {
  itemId: string;
  filePath: string;
  componentsUsed: string[];
  displayContexts: string[];
  conditionalModels: ConditionalModel[];
}

export interface ConditionalModel {
  component: string;
  conditions: unknown[];
  contextMappings: { [context: string]: string }; // context -> modelPath
}

export class ResourcePackIntrospector {
  private tracer?: StructuredTracer;

  constructor(tracer?: StructuredTracer) {
    this.tracer = tracer;
  }

  async analyzeStructure(packDir: string, verbose = false): Promise<ResourcePackStructure> {
    const structure: ResourcePackStructure = {
      itemFiles: [],
      modelFiles: [],
      textureFiles: [],
      textureDirectories: {},
      modelDirectories: {},
    };

    await this.scanDirectory(packDir, structure, "", verbose);
    return structure;
  }

  private async scanDirectory(
    dir: string,
    structure: ResourcePackStructure,
    basePath = "",
    verbose = false
  ) {
    const scanSpan = this.tracer?.startSpan(`Scan Directory: ${basePath || "root"}`);
    scanSpan?.setAttributes({ dir, basePath });

    if (verbose) {
      scanSpan?.debug("Scanning directory", { dir, basePath });
    }

    if (!existsSync(dir)) {
      if (verbose) {
        scanSpan?.debug("Directory does not exist", { dir });
      }
      scanSpan?.end({ success: false, reason: "directory_not_found" });
      return;
    }

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relativePath = join(basePath, entry.name);

        if (entry.isDirectory()) {
          await this.scanDirectory(fullPath, structure, relativePath, verbose);
        } else if (entry.isFile()) {
          await this.categorizeFile(fullPath, relativePath, structure, verbose);
        }
      }

      scanSpan?.end({ success: true, entriesProcessed: entries.length });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      scanSpan?.error("Failed to scan directory", {
        error: errorMessage,
        stack: errorStack,
      });
      scanSpan?.end({ success: false, error: errorMessage });
      throw error;
    }
  }

  private async categorizeFile(
    fullPath: string,
    relativePath: string,
    structure: ResourcePackStructure,
    verbose = false
  ) {
    const fileSpan = this.tracer?.startSpan("Categorize File");
    fileSpan?.setAttributes({ relativePath, fullPath });

    if (verbose) {
      fileSpan?.debug("Categorizing file");
    }

    if (relativePath.includes("assets/minecraft/items/") && relativePath.endsWith(".json")) {
      if (verbose) {
        fileSpan?.debug("Found item file");
      }
      structure.itemFiles.push(fullPath);
      fileSpan?.end({ success: true, type: "item" });
    } else if (
      relativePath.includes("assets/minecraft/models/") &&
      relativePath.endsWith(".json")
    ) {
      if (verbose) {
        fileSpan?.debug("Found model file");
      }
      structure.modelFiles.push(fullPath);
      const dir = relativePath.substring(0, relativePath.lastIndexOf("/"));
      if (!structure.modelDirectories[dir]) structure.modelDirectories[dir] = [];
      structure.modelDirectories[dir].push(relativePath);
      fileSpan?.end({ success: true, type: "model" });
    } else if (
      relativePath.includes("assets/minecraft/textures/") &&
      this.isImageFile(relativePath)
    ) {
      if (verbose) {
        fileSpan?.debug("Found texture file");
      }
      structure.textureFiles.push(fullPath);
      const dir = relativePath.substring(0, relativePath.lastIndexOf("/"));
      if (!structure.textureDirectories[dir]) structure.textureDirectories[dir] = [];
      structure.textureDirectories[dir].push(relativePath);
      fileSpan?.end({ success: true, type: "texture" });
    } else {
      if (verbose) {
        fileSpan?.debug("Skipped file (not a resource)");
      }
      fileSpan?.end({ success: true, type: "skipped" });
    }
  }

  private isImageFile(path: string): boolean {
    return path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".jpeg");
  }

  async analyzeComponent(itemFilePath: string): Promise<ComponentAnalysis> {
    const content = JSON.parse(await readFile(itemFilePath, "utf-8"));
    const itemId = itemFilePath.split("/").pop()?.replace(".json", "") || "";

    const analysis: ComponentAnalysis = {
      itemId,
      filePath: itemFilePath,
      componentsUsed: [],
      displayContexts: [],
      conditionalModels: [],
    };

    this.extractComponentInfo(content, analysis);
    return analysis;
  }

  private extractComponentInfo(
    obj: unknown,
    analysis: ComponentAnalysis,
    path = "",
    currentContexts: string[] = []
  ) {
    if (typeof obj !== "object" || obj === null) return;

    const objectData = obj as Record<string, unknown>;

    for (const [key, value] of Object.entries(objectData)) {
      const currentPath = path ? `${path}.${key}` : key;

      // Track components being used
      if (key === "component" && typeof value === "string") {
        if (!analysis.componentsUsed.includes(value)) {
          analysis.componentsUsed.push(value);
        }
      }

      // Track display context selectors and extract their mappings
      if (key === "property" && value === "minecraft:display_context") {
        this.extractDisplayContextMappings(objectData, analysis, currentContexts);
        return; // Don't recurse further as we've handled this branch
      }

      // Track component selectors within display contexts
      if (key === "component" && this.hasProperty(objectData, "cases")) {
        this.extractConditionalModels(objectData, analysis, currentPath, currentContexts);
        return; // Don't recurse further as we've handled this branch
      }

      // Handle minecraft:condition with on_true/on_false branches
      if (key === "type" && value === "minecraft:condition") {
        this.extractConditionModels(objectData, analysis, currentPath, currentContexts);
        return; // Don't recurse further as we've handled this branch
      }

      // Recurse with updated context
      if (typeof value === "object") {
        this.extractComponentInfo(value, analysis, currentPath, currentContexts);
      }
    }
  }

  private hasProperty(obj: Record<string, unknown>, prop: string): boolean {
    return prop in obj;
  }

  private isModelObject(value: unknown): value is Record<string, unknown> {
    return (
      typeof value === "object" &&
      value !== null &&
      typeof (value as Record<string, unknown>).type === "string" &&
      (value as Record<string, unknown>).type === "minecraft:model"
    );
  }

  private hasStringProperty(obj: Record<string, unknown>, prop: string): boolean {
    return prop in obj && typeof obj[prop] === "string";
  }

  private extractDisplayContextMappings(
    selectObj: Record<string, unknown>,
    analysis: ComponentAnalysis,
    _parentContexts: string[]
  ) {
    const explicitContexts = new Set<string>();

    if (Array.isArray(selectObj.cases)) {
      for (const caseItem of selectObj.cases) {
        if (typeof caseItem === "object" && caseItem !== null) {
          const caseObj = caseItem as Record<string, unknown>;

          if (caseObj.when && caseObj.model) {
            const contexts = Array.isArray(caseObj.when) ? caseObj.when : [caseObj.when];

            // Track explicitly handled contexts
            for (const context of contexts) {
              if (typeof context === "string") {
                explicitContexts.add(context);
              }
            }

            // Add to global context list
            for (const context of contexts) {
              if (typeof context === "string" && !analysis.displayContexts.includes(context)) {
                analysis.displayContexts.push(context);
              }
            }

            // Check if this is a direct model reference (no further component selection)
            if (
              this.isModelObject(caseObj.model) &&
              this.hasStringProperty(caseObj.model as Record<string, unknown>, "model")
            ) {
              // This is a direct context->model mapping, create a conditional model for it
              const contextMappings: { [context: string]: string } = {};
              const modelPath = (caseObj.model as Record<string, unknown>).model as string;

              for (const context of contexts) {
                if (typeof context === "string") {
                  contextMappings[context] = modelPath;
                }
              }

              analysis.conditionalModels.push({
                component: "pure_display_context",
                conditions: [{}], // Empty condition for pure context mapping
                contextMappings,
              });
            } else if (typeof caseObj.model === "object") {
              // Recurse into the model with the current contexts
              const stringContexts = contexts.filter(
                (ctx): ctx is string => typeof ctx === "string"
              );
              this.extractComponentInfo(caseObj.model, analysis, "", stringContexts);
            }
          }
        }
      }
    }

    // Handle fallback case - infer missing standard contexts
    if (
      selectObj.fallback &&
      this.isModelObject(selectObj.fallback) &&
      this.hasStringProperty(selectObj.fallback as Record<string, unknown>, "model")
    ) {
      const standardContexts = [
        "gui",
        "fixed",
        "ground",
        "firstperson_righthand",
        "thirdperson_righthand",
        "firstperson_lefthand",
        "thirdperson_lefthand",
        "head",
      ];

      const missingContexts = standardContexts.filter((context) => !explicitContexts.has(context));

      if (missingContexts.length > 0) {
        // Add missing contexts to global context list
        for (const context of missingContexts) {
          if (!analysis.displayContexts.includes(context)) {
            analysis.displayContexts.push(context);
          }
        }

        // Create context mappings for fallback contexts
        const fallbackContextMappings: { [context: string]: string } = {};
        const fallbackObj = selectObj.fallback as Record<string, unknown>;
        if (typeof fallbackObj.model === "string") {
          for (const context of missingContexts) {
            fallbackContextMappings[context] = fallbackObj.model;
          }
        }

        analysis.conditionalModels.push({
          component: "pure_display_context",
          conditions: [{}], // Empty condition for pure context mapping
          contextMappings: fallbackContextMappings,
        });
      }
    }
  }

  private extractConditionalModels(
    selectObj: Record<string, unknown>,
    analysis: ComponentAnalysis,
    _path: string,
    parentContexts: string[] = []
  ) {
    const component = typeof selectObj.component === "string" ? selectObj.component : "unknown";

    if (Array.isArray(selectObj.cases)) {
      for (const caseItem of selectObj.cases) {
        if (typeof caseItem === "object" && caseItem !== null) {
          const caseObj = caseItem as Record<string, unknown>;

          if (caseObj.when && caseObj.model) {
            const conditions = Array.isArray(caseObj.when) ? caseObj.when : [caseObj.when];

            let modelPath: string;
            if (typeof caseObj.model === "string") {
              modelPath = caseObj.model;
            } else if (typeof caseObj.model === "object" && caseObj.model !== null) {
              const modelObj = caseObj.model as Record<string, unknown>;
              modelPath = typeof modelObj.model === "string" ? modelObj.model : "";
            } else {
              modelPath = "";
            }

            // Build context mappings - each condition gets mapped to specific contexts with specific models
            const contextMappings: { [context: string]: string } = {};
            for (const context of parentContexts) {
              contextMappings[context] = modelPath;
            }

            analysis.conditionalModels.push({
              component,
              conditions,
              contextMappings,
            });
          }
        }
      }
    }
  }

  private extractConditionModels(
    condition: Record<string, unknown>,
    analysis: ComponentAnalysis,
    _path: string,
    currentContexts: string[]
  ) {
    // Handle minecraft:condition with on_true/on_false branches
    // Add the component being used to analysis
    if (condition.property === "minecraft:component" && typeof condition.predicate === "string") {
      if (!analysis.componentsUsed.includes(condition.predicate)) {
        analysis.componentsUsed.push(condition.predicate);
      }
    }

    // Extract models from both branches and add them to current contexts
    if (condition.on_true) {
      this.extractModelsFromBranch(condition.on_true, analysis, currentContexts);
    }
    if (condition.on_false) {
      this.extractModelsFromBranch(condition.on_false, analysis, currentContexts);
    }
  }

  private extractModelsFromBranch(
    branch: unknown,
    analysis: ComponentAnalysis,
    currentContexts: string[]
  ) {
    if (typeof branch === "object" && branch !== null) {
      const branchObj = branch as Record<string, unknown>;

      if (branchObj.type === "minecraft:model" && typeof branchObj.model === "string") {
        // Build context mappings for all current contexts
        const contextMappings: { [context: string]: string } = {};
        for (const context of currentContexts) {
          contextMappings[context] = branchObj.model;
        }

        analysis.conditionalModels.push({
          component: "pure_display_context", // This is just for context switching
          conditions: [], // No additional conditions for simple model refs
          contextMappings,
        });
      } else {
        // Recurse to find nested models
        this.extractComponentInfo(branchObj, analysis, "", currentContexts);
      }
    }
  }
}
