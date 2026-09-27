import { z } from 'zod';
import type { ToolSpec } from '../types';
import type { ManifestEditor } from '../manifestEditor';
import type { LoreGraph } from '../../lore/LoreGraph';
import type { ContinuitySupervisor } from '../../lore/continuity';
import type { AssetRegistry, AssetSynthesizer } from '../../assets/registry';
import type { ManifestIssue } from '../../manifest';

export interface ToolContext {
  editor: ManifestEditor;
  lore?: LoreGraph;
  supervisor?: ContinuitySupervisor;
  assets?: AssetRegistry;
  synthesizer?: AssetSynthesizer;
  /** Momento narrativo actual (beat * 1000). */
  timestamp?: number;
}

export interface ToolOutcome {
  /** Resultado serializable devuelto al modelo. */
  result: unknown;
  /** Resumen para el autor, en lenguaje literario. */
  summary: string;
  /** `true` si la herramienta modifica la obra (requiere aprobación del autor). */
  mutates: boolean;
  issues?: ManifestIssue[];
  nodeId?: string;
}

export interface AgentTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  run(args: z.output<S>, ctx: ToolContext): Promise<ToolOutcome>;
}

export function defineTool<S extends z.ZodType>(tool: AgentTool<S>): AgentTool<S> {
  return tool;
}

export function toToolSpec(tool: AgentTool): ToolSpec {
  const { $schema: _ignored, ...parameters } = z.toJSONSchema(tool.schema, { io: 'input' }) as Record<string, unknown>;
  return { name: tool.name, description: tool.description, parameters };
}

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  constructor(tools: AgentTool[] = []) {
    for (const tool of tools) this.register(tool);
  }

  register(tool: AgentTool) {
    this.tools.set(tool.name, tool);
  }

  get(name: string) {
    return this.tools.get(name);
  }

  names() {
    return [...this.tools.keys()];
  }

  specs(): ToolSpec[] {
    return [...this.tools.values()].map(toToolSpec);
  }

  /** Ejecuta una llamada validando sus argumentos; nunca lanza. */
  async execute(name: string, args: unknown, ctx: ToolContext): Promise<ToolOutcome & { error?: string }> {
    const tool = this.tools.get(name);
    if (!tool) return { result: { error: `Herramienta desconocida: ${name}` }, summary: '', mutates: false, error: 'unknown_tool' };
    const parsed = tool.schema.safeParse(args);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; ');
      return { result: { error: `Argumentos inválidos: ${detail}` }, summary: '', mutates: false, error: 'invalid_arguments' };
    }
    // Un identificador de escena inventado crearía una escena vacía al parchearla: se rechaza y se
    // ofrecen los válidos para que el modelo corrija en el siguiente paso.
    const target = (parsed.data as { node_id?: unknown }).node_id;
    if (typeof target === 'string' && !ctx.editor.node(target)) {
      const known = ctx.editor.current.nodes.map((n) => n.node_id);
      const list = known.slice(0, 40).join(', ') + (known.length > 40 ? '…' : '');
      return { result: { error: `La escena «${target}» no existe. Escenas válidas: ${list}` }, summary: '', mutates: false, error: 'unknown_node' };
    }
    try {
      return await tool.run(parsed.data, ctx);
    } catch (error) {
      return { result: { error: String(error) }, summary: '', mutates: false, error: 'tool_failed' };
    }
  }
}
