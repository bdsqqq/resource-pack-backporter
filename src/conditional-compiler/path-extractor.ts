import type { ExecutionPath } from './index';

interface ConditionChainItem {
  property: string;
  component?: string;
  when: any;
}

export class ConditionalPathExtractor {
  extractAllPaths(sourceModel: any): ExecutionPath[] {
    if (!sourceModel?.model) {
      throw new Error('Invalid source model: missing model property');
    }
    
    return this.traverseSelector(sourceModel.model, []);
  }

  private traverseSelector(node: any, currentConditions: ConditionChainItem[]): ExecutionPath[] {
    // Handle direct model references
    if (typeof node === 'string') {
      return [{
        conditions: this.mergeConditions(currentConditions),
        targetModel: node,
        priority: this.calculatePriority(currentConditions),
        isFallback: false
      }];
    }

    // Handle model objects with type
    if (node.type === 'minecraft:model') {
      return [{
        conditions: this.mergeConditions(currentConditions),
        targetModel: node.model,
        priority: this.calculatePriority(currentConditions),
        isFallback: false
      }];
    }

    // Handle selector nodes
    if (node.type === 'minecraft:select') {
      const paths: ExecutionPath[] = [];
      
      // Process each case
      if (node.cases) {
        for (const caseItem of node.cases) {
          const newConditions = [...currentConditions, {
            property: node.property,
            component: node.component,
            when: caseItem.when
          }];
          paths.push(...this.traverseSelector(caseItem.model, newConditions));
        }
      }

      // Process fallback
      if (node.fallback) {
        const fallbackConditions = [...currentConditions, {
          property: node.property,
          component: node.component,
          when: 'FALLBACK'
        }];
        const fallbackPaths = this.traverseSelector(node.fallback, fallbackConditions);
        fallbackPaths.forEach(path => path.isFallback = true);
        paths.push(...fallbackPaths);
      }

      return paths;
    }

    // Handle condition nodes (new in 1.21.4+)
    if (node.type === 'minecraft:condition') {
      const paths: ExecutionPath[] = [];
      
      // For conditions, we generate paths for both on_true and on_false cases
      // In the backport, we'll typically use the on_false case as the main model
      // since 1.21.1 doesn't have the component checking capability
      
      if (node.on_true) {
        const trueConditions = [...currentConditions, {
          property: node.property,
          component: node.predicate,
          when: 'CONDITION_TRUE'
        }];
        const truePaths = this.traverseSelector(node.on_true, trueConditions);
        truePaths.forEach(path => path.priority += 5); // Lower priority for conditional paths
        paths.push(...truePaths);
      }
      
      if (node.on_false) {
        const falseConditions = [...currentConditions, {
          property: node.property,
          component: node.predicate,
          when: 'CONDITION_FALSE'
        }];
        const falsePaths = this.traverseSelector(node.on_false, falseConditions);
        paths.push(...falsePaths);
      }
      
      return paths;
    }

    throw new Error(`Unknown node type: ${node.type || 'missing type'}`);
  }

  private mergeConditions(conditionChain: ConditionChainItem[]): ExecutionPath['conditions'] {
    const merged = {
      displayContext: [] as string[],
      enchantment: undefined as { type: string, level: number } | undefined,
      component: undefined as string | undefined
    };

    for (const condition of conditionChain) {
      if (condition.property === 'minecraft:display_context') {
        // Handle array of contexts
        if (Array.isArray(condition.when)) {
          merged.displayContext.push(...condition.when);
        } else {
          merged.displayContext.push(condition.when);
        }
      }
      
      if (condition.property === 'minecraft:component') {
        merged.component = condition.component;
        if (condition.when !== 'FALLBACK') {
          merged.enchantment = this.parseEnchantment(condition.when);
        }
      }
    }

    return merged;
  }

  private parseEnchantment(when: any): { type: string, level: number } | undefined {
    if (!when || typeof when !== 'object') return undefined;

    // Handle single enchantment object: { "minecraft:channeling": 1 }
    if (!Array.isArray(when)) {
      for (const [enchantmentName, level] of Object.entries(when)) {
        return {
          type: enchantmentName.replace('minecraft:', ''),
          level: level as number
        };
      }
    }

    // Handle array of enchantment objects: [{ "minecraft:efficiency": 1 }, { "minecraft:efficiency": 2 }]
    if (Array.isArray(when) && when.length > 0) {
      const firstEnchantment = when[0];
      if (typeof firstEnchantment === 'object') {
        for (const [enchantmentName, level] of Object.entries(firstEnchantment)) {
          return {
            type: enchantmentName.replace('minecraft:', ''),
            level: level as number
          };
        }
      }
    }

    return undefined;
  }

  private calculatePriority(conditionChain: ConditionChainItem[]): number {
    // Higher priority for more specific conditions
    let priority = 0;
    
    for (const condition of conditionChain) {
      if (condition.property === 'minecraft:display_context') {
        priority += 10;
      }
      if (condition.property === 'minecraft:component' && condition.when !== 'FALLBACK') {
        priority += 20; // Enchantment-specific paths have higher priority
      }
    }
    
    return priority;
  }
}
