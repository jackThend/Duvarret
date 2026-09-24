/**
 * Orquestador agéntico y bus de herramientas (doc 02 §4.2).
 *
 * Bucle: el modelo propone llamadas → se validan y ejecutan sobre un BORRADOR del manifiesto →
 * los resultados vuelven al modelo → … hasta que responde. El autor decide si aplica el borrador:
 * el agente es un co-director asesor, nunca reemplaza la última palabra del autor.
 */
import type { StoryManifest, ManifestIssue } from '../manifest';
import { ManifestEditor } from './manifestEditor';
import { DIRECTOR_TOOLS } from './tools/directorTools';
import { ToolRegistry, type ToolContext, type ToolOutcome } from './tools/registry';
import { ProviderError, type ChatMessage, type DirectorContext, type LlmProvider, type StopReason, type ToolCall } from './types';

export const DIRECTOR_SYSTEM_PROMPT = `Eres el Agente Director Dramatúrgico de Duvarret, co-director de una obra literaria interactiva.
Tu trabajo: proponer y aplicar intervenciones de puesta en escena sobre la escena actual usando EXCLUSIVAMENTE las herramientas disponibles.
Reglas:
- Nunca escribas código, scripts, CSS ni JSON a mano: toda la obra se describe con las herramientas.
- Antes de proponer acontecimientos nuevos, consulta el lore (queryLoreGraph) y valida la continuidad (validateContinuity).
- Coordenadas de audio en metros relativas a la cabeza del oyente: x derecha (+) / izquierda (−), y arriba (+) / abajo (−), z delante (+) / detrás (−).
- Habla con el autor en su idioma, con vocabulario literario (tono, ritmo, tensión, atmósfera, eco, presencia). Evita la jerga técnica.
- Sé breve: explica en una o dos frases qué propones y por qué sirve a la obra. El autor tiene siempre la última palabra.`;

export interface ToolExecution {
  call: ToolCall;
  outcome: ToolOutcome & { error?: string };
}

export interface DirectorTurn {
  reply: string;
  executions: ToolExecution[];
  /** Manifiesto propuesto (borrador) tras aplicar las herramientas. */
  draft: StoryManifest;
  mutated: boolean;
  issues: ManifestIssue[];
  history: ChatMessage[];
  stopReason: StopReason | 'max_steps' | 'error';
  error?: string;
}

export interface OrchestratorOptions {
  provider: LlmProvider;
  registry?: ToolRegistry;
  systemPrompt?: string;
  maxSteps?: number;
}

export interface RunOptions {
  message: string;
  manifest: StoryManifest;
  history?: ChatMessage[];
  context?: DirectorContext;
  tools?: Omit<ToolContext, 'editor'>;
  signal?: AbortSignal;
}

export class DirectorOrchestrator {
  readonly registry: ToolRegistry;
  private readonly maxSteps: number;

  constructor(private readonly options: OrchestratorOptions) {
    this.registry = options.registry ?? new ToolRegistry(DIRECTOR_TOOLS);
    this.maxSteps = options.maxSteps ?? 6;
  }

  get provider() {
    return this.options.provider;
  }

  /** Ejecuta un lote de llamadas ya decididas (p. ej. al aceptar una Pitch Card). */
  async applyCalls(calls: ToolCall[], manifest: StoryManifest, tools: Omit<ToolContext, 'editor'> = {}) {
    const editor = new ManifestEditor(manifest);
    const executions: ToolExecution[] = [];
    for (const call of calls) executions.push({ call, outcome: await this.registry.execute(call.name, call.arguments, { ...tools, editor }) });
    return { draft: editor.current, executions, mutated: executions.some((e) => e.outcome.mutates && !e.outcome.error) };
  }

  async run(options: RunOptions): Promise<DirectorTurn> {
    const editor = new ManifestEditor(options.manifest);
    const ctx: ToolContext = { ...(options.tools ?? {}), editor };
    const specs = this.registry.specs();
    const history: ChatMessage[] = [...(options.history ?? []), { role: 'user', content: options.message }];
    const messages = (): ChatMessage[] => [{ role: 'system', content: this.options.systemPrompt ?? DIRECTOR_SYSTEM_PROMPT }, ...history];
    const executions: ToolExecution[] = [];
    let reply = '';
    let stopReason: DirectorTurn['stopReason'] = 'max_steps';
    let error: string | undefined;

    for (let step = 0; step < this.maxSteps; step++) {
      let response;
      try {
        response = await this.options.provider.complete({ messages: messages(), tools: specs, ...(options.context ? { context: options.context } : {}), ...(options.signal ? { signal: options.signal } : {}) });
      } catch (e) {
        stopReason = 'error';
        error = e instanceof ProviderError ? e.message : `No se pudo consultar al co-director: ${String(e)}`;
        reply = error;
        break;
      }
      history.push({
        role: 'assistant',
        content: response.content,
        ...(response.toolCalls.length ? { toolCalls: response.toolCalls } : {}),
        ...(response.providerContent !== undefined ? { providerContent: response.providerContent, provider: this.options.provider.kind } : {}),
      });
      if (response.content) reply = response.content;
      if (response.stopReason === 'refusal') {
        stopReason = 'refusal';
        reply = response.content || 'El co-director prefirió no continuar con esta petición. Prueba a reformularla.';
        break;
      }
      if (!response.toolCalls.length) {
        stopReason = response.stopReason;
        break;
      }
      for (const call of response.toolCalls) {
        const outcome = await this.registry.execute(call.name, call.arguments, ctx);
        executions.push({ call, outcome });
        history.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify(outcome.result ?? null),
          ...(outcome.error ? { isError: true } : {}),
        });
      }
    }

    return {
      reply,
      executions,
      draft: editor.current,
      mutated: executions.some((e) => e.outcome.mutates && !e.outcome.error),
      issues: executions.flatMap((e) => e.outcome.issues ?? []),
      history,
      stopReason,
      ...(error ? { error } : {}),
    };
  }
}
