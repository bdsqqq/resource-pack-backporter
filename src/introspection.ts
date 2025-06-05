import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ResourcePackStructure } from './file-manager';

export interface ComponentAnalysis {
  itemId: string;
  filePath: string;
  componentsUsed: string[];
  displayContexts: string[];
  conditionalModels: ConditionalModel[];
}

export interface ConditionalModel {
  component: string;
  conditions: any[];
  contextMappings: { [context: string]: string }; // context -> modelPath
}

export class ResourcePackIntrospector {
  async analyzeStructure(packDir: string, verbose: boolean = false): Promise<ResourcePackStructure> {
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
    if (verbose) {
      console.log(`📂 Scanning directory: ${dir} (basePath: ${basePath})`);
    }
    if (!existsSync(dir)) {
      if (verbose) {
        console.log(`❌ Directory does not exist: ${dir}`);
      }
      return;
    }

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
  }

  private async categorizeFile(
    fullPath: string,
    relativePath: string,
    structure: ResourcePackStructure,
    verbose = false
  ) {
    if (verbose) {
      console.log(`🔍 Categorizing: ${relativePath}`);
    }
    if (
      relativePath.includes("assets/minecraft/items/") &&
      relativePath.endsWith(".json")
    ) {
      if (verbose) {
        console.log(`📄 Found item file: ${relativePath}`);
      }
      structure.itemFiles.push(fullPath);
    } else if (
      relativePath.includes("assets/minecraft/models/") &&
      relativePath.endsWith(".json")
    ) {
      structure.modelFiles.push(fullPath);
      const dir = relativePath.substring(0, relativePath.lastIndexOf("/"));
      if (!structure.modelDirectories[dir])
        structure.modelDirectories[dir] = [];
      structure.modelDirectories[dir].push(relativePath);
    } else if (
      relativePath.includes("assets/minecraft/textures/") &&
      this.isImageFile(relativePath)
    ) {
      structure.textureFiles.push(fullPath);
      const dir = relativePath.substring(0, relativePath.lastIndexOf("/"));
      if (!structure.textureDirectories[dir])
        structure.textureDirectories[dir] = [];
      structure.textureDirectories[dir].push(relativePath);
    }
  }

  private isImageFile(path: string): boolean {
    return (
      path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".jpeg")
    );
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
    obj: any,
    analysis: ComponentAnalysis,
    path = "",
    currentContexts: string[] = []
  ) {
    if (typeof obj !== "object" || obj === null) return;

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      // Track components being used
      if (key === "component" && typeof value === "string") {
        if (!analysis.componentsUsed.includes(value)) {
          analysis.componentsUsed.push(value);
        }
      }

      // Track display context selectors and extract their mappings
      if (key === "property" && value === "minecraft:display_context") {
        this.extractDisplayContextMappings(obj, analysis, currentContexts);
        return; // Don't recurse further as we've handled this branch
      }

      // Track component selectors within display contexts
      if (key === "component" && obj.cases) {
        this.extractConditionalModels(
          obj,
          analysis,
          currentPath,
          currentContexts
        );
        return; // Don't recurse further as we've handled this branch
      }

      // Handle minecraft:condition with on_true/on_false branches
      if (key === "type" && value === "minecraft:condition") {
        this.extractConditionModels(
          obj,
          analysis,
          currentPath,
          currentContexts
        );
        return; // Don't recurse further as we've handled this branch
      }

      // Recurse with updated context
      if (typeof value === "object") {
        this.extractComponentInfo(
          value,
          analysis,
          currentPath,
          currentContexts
        );
      }
    }
  }

  private extractDisplayContextMappings(
    selectObj: any,
    analysis: ComponentAnalysis,
    _parentContexts: string[]
  ) {
    const explicitContexts = new Set<string>();

    if (selectObj.cases && Array.isArray(selectObj.cases)) {
      for (const caseObj of selectObj.cases) {
        if (caseObj.when && caseObj.model) {
          const contexts = Array.isArray(caseObj.when)
            ? caseObj.when
            : [caseObj.when];

          // Track explicitly handled contexts
          for (const context of contexts) {
            if (typeof context === "string") {
              explicitContexts.add(context);
            }
          }

          // Add to global context list
          for (const context of contexts) {
            if (
              typeof context === "string" &&
              !analysis.displayContexts.includes(context)
            ) {
              analysis.displayContexts.push(context);
            }
          }

          // Check if this is a direct model reference (no further component selection)
          if (caseObj.model.type === "minecraft:model" && caseObj.model.model) {
            // This is a direct context->model mapping, create a conditional model for it
            const contextMappings: { [context: string]: string } = {};
            for (const context of contexts) {
              contextMappings[context] = caseObj.model.model;
            }

            analysis.conditionalModels.push({
              component: "pure_display_context",
              conditions: [{}], // Empty condition for pure context mapping
              contextMappings,
            });
          } else if (typeof caseObj.model === "object") {
            // Recurse into the model with the current contexts
            this.extractComponentInfo(caseObj.model, analysis, "", contexts);
          }
        }
      }
    }

    // Handle fallback case - infer missing standard contexts
    if (
      selectObj.fallback &&
      selectObj.fallback.type === "minecraft:model" &&
      selectObj.fallback.model
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

      const missingContexts = standardContexts.filter(
        (context) => !explicitContexts.has(context)
      );

      if (missingContexts.length > 0) {
        // Add missing contexts to global context list
        for (const context of missingContexts) {
          if (!analysis.displayContexts.includes(context)) {
            analysis.displayContexts.push(context);
          }
        }

        // Create context mappings for fallback contexts
        const fallbackContextMappings: { [context: string]: string } = {};
        for (const context of missingContexts) {
          fallbackContextMappings[context] = selectObj.fallback.model;
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
    selectObj: any,
    analysis: ComponentAnalysis,
    _path: string,
    parentContexts: string[] = []
  ) {
    const component = selectObj.component || "unknown";

    if (selectObj.cases && Array.isArray(selectObj.cases)) {
      for (const caseObj of selectObj.cases) {
        if (caseObj.when && caseObj.model) {
          const conditions = Array.isArray(caseObj.when)
            ? caseObj.when
            : [caseObj.when];
          const modelPath = caseObj.model.model || caseObj.model;

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

  private extractConditionModels(
    condition: any,
    analysis: ComponentAnalysis,
    _path: string,
    currentContexts: string[]
  ) {
    // Handle minecraft:condition with on_true/on_false branches
    // Add the component being used to analysis
    if (condition.property === "minecraft:component" && condition.predicate) {
      if (!analysis.componentsUsed.includes(condition.predicate)) {
        analysis.componentsUsed.push(condition.predicate);
      }
    }

    // Extract models from both branches and add them to current contexts
    if (condition.on_true) {
      this.extractModelsFromBranch(
        condition.on_true,
        analysis,
        currentContexts
      );
    }
    if (condition.on_false) {
      this.extractModelsFromBranch(
        condition.on_false,
        analysis,
        currentContexts
      );
    }
  }

  private extractModelsFromBranch(
    branch: any,
    analysis: ComponentAnalysis,
    currentContexts: string[]
  ) {
    if (branch.type === "minecraft:model" && branch.model) {
      // Build context mappings for all current contexts
      const contextMappings: { [context: string]: string } = {};
      for (const context of currentContexts) {
        contextMappings[context] = branch.model;
      }

      analysis.conditionalModels.push({
        component: "pure_display_context", // This is just for context switching
        conditions: [], // No additional conditions for simple model refs
        contextMappings,
      });
    } else if (typeof branch === "object") {
      // Recurse to find nested models
      this.extractComponentInfo(branch, analysis, "", currentContexts);
    }
  }
}
