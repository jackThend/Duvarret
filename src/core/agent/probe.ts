/**
 * Prueba de extremo a extremo de un proveedor de IA: una vuelta real del co-director sobre una
 * copia de la obra. Comprueba que hay conexión, que el modelo usa las herramientas (en lugar de
 * escribir JSON a mano), que coloca el sonido pedido y que el borrador sigue siendo válido.
 * Nada se aplica a la obra: el resultado es solo un informe.
 */
import { checkIntegrity, validateManifest, type StoryManifest } from '../manifest';
import { DirectorOrchestrator } from './orchestrator';
import type { LlmProvider } from './types';

export interface ProbeCheck {
  id: 'connection' | 'tools' | 'placement' | 'valid';
  label: string;
  ok: boolean;
  detail?: string;
}

export interface ProbeReport {
  ok: boolean;
  provider: LlmProvider['kind'];
  model: string;
  latencyMs: number;
  steps: number;
  tools: string[];
  reply: string;
  checks: ProbeCheck[];
}

export const PROBE_ASSET = 'assets/audio/sfx/prueba_de_conexion.wav';

export async function probeProvider(provider: LlmProvider, manifest: StoryManifest, options: { nodeId?: string; signal?: AbortSignal } = {}): Promise<ProbeReport> {
  const node = manifest.nodes.find((n) => n.node_id === options.nodeId) ?? manifest.nodes[0];
  if (!node) throw new Error('La obra no tiene escenas con las que probar.');
  const orchestrator = new DirectorOrchestrator({ provider, maxSteps: 6 });
  const started = Date.now();
  const turn = await orchestrator.run({
    message: `Coloca el sonido «${PROBE_ASSET}» (un reloj de pared) a la izquierda del oyente, a unos dos metros, en la escena «${node.node_id}». Usa la herramienta placeSpatialAudio.`,
    manifest,
    context: { nodeId: node.node_id, nodeText: node.text_payload.slice(0, 1200), ...(node.title ? { nodeTitle: node.title } : {}) },
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const latencyMs = Date.now() - started;

  // Vale cualquier sonido nuevo en la escena (el director local elige su propio archivo).
  const before = new Set(node.acoustic_events.map((e) => e.event_id));
  const added = turn.draft.nodes.find((n) => n.node_id === node.node_id)?.acoustic_events.filter((e) => !before.has(e.event_id)) ?? [];
  const placed = added.find((e) => e.asset === PROBE_ASSET) ?? added[0];
  const baseline = new Set(checkIntegrity(manifest).filter((i) => i.severity === 'error').map((i) => i.message));
  const validation = validateManifest(turn.draft);
  const newErrors = [...validation.issues, ...checkIntegrity(validation.manifest)].filter((i) => i.severity === 'error' && !baseline.has(i.message));
  const failedTools = turn.executions.filter((e) => e.outcome.error);

  const checks: ProbeCheck[] = [
    { id: 'connection', label: 'Conexión con el modelo', ok: turn.stopReason !== 'error', ...(turn.error ? { detail: turn.error } : {}) },
    {
      id: 'tools',
      label: 'Usa las herramientas del co-director',
      ok: turn.executions.length > 0 && failedTools.length < turn.executions.length,
      ...(failedTools.length
        ? { detail: failedTools.map((e) => `${e.call.name}: ${e.outcome.error}`).join(' · ') }
        : turn.executions.length
          ? {}
          : { detail: turn.stopReason === 'error' ? 'Sin respuesta del modelo.' : 'Respondió solo con texto.' }),
    },
    {
      id: 'placement',
      label: 'Coloca el sonido pedido',
      ok: !!placed && placed.coordinates.x < 0,
      ...(placed ? { detail: `x=${placed.coordinates.x}, y=${placed.coordinates.y}, z=${placed.coordinates.z}` } : {}),
    },
    { id: 'valid', label: 'La obra sigue siendo válida', ok: newErrors.length === 0, ...(newErrors.length ? { detail: newErrors.map((i) => i.message).join(' · ') } : {}) },
  ];

  return {
    ok: checks.every((c) => c.ok),
    provider: provider.kind,
    model: provider.model,
    latencyMs,
    steps: turn.history.filter((m) => m.role === 'assistant').length,
    tools: turn.executions.map((e) => e.call.name),
    reply: turn.reply,
    checks,
  };
}
