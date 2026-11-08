import type { ToolDefinition } from './types.js';

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();
  register<T extends ToolDefinition>(tool: T): void {
    if (this.tools.has(tool.name)) throw new Error(`Duplicate tool registration: ${tool.name}`);
    this.tools.set(tool.name, tool);
  }
  get(name: string): ToolDefinition | undefined { return this.tools.get(name); }
  list(includeDisabled = false): ToolDefinition[] {
    return [...this.tools.values()].filter((tool) => includeDisabled || tool.enabled);
  }
}
