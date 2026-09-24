/**
 * Director local heurístico: implementa la misma interfaz que un modelo de lenguaje, pero de
 * forma determinista y 100% offline. Garantiza que Duvarret funcione sin conexión ni claves
 * (RNF-04) y sirve de base para las propuestas proactivas (Pitch Cards).
 */
import { analyzeBeat, normalizeText, TONE_LABELS } from '../ingest/toneAnalyzer';
import { parseSpatialDescription } from './spatialLanguage';
import type { StoryNode } from '../manifest';
import { newCallId, type CompletionRequest, type CompletionResponse, type LlmProvider, type ToolCall } from './types';

export interface PitchSuggestion {
  id: string;
  title: string;
  rationale: string;
  calls: ToolCall[];
}

const SOUND_NOUNS: [RegExp, string, string][] = [
  [/gotera|gota|goteo/, 'drip', 'gotera'],
  [/pasos/, 'footsteps', 'pasos'],
  [/telefono/, 'phone_ring', 'teléfono'],
  [/grito|alarido/, 'scream', 'grito'],
  [/trueno|tormenta/, 'thunder', 'trueno'],
  [/respiracion|aliento|jadeo/, 'breathing', 'respiración'],
  [/latido|corazon/, 'heartbeat', 'latido'],
  [/campana/, 'bell', 'campana'],
  [/puerta/, 'door', 'puerta'],
  [/viento/, 'wind', 'viento'],
  [/reloj|tic.?tac/, 'clock', 'reloj'],
  [/lluvia/, 'rain', 'lluvia'],
  [/carruaje|caballo/, 'carriage', 'carruaje'],
  [/musica|piano|violin/, 'music', 'música'],
];

const call = (name: string, args: Record<string, unknown>): ToolCall => ({ id: newCallId('local'), name, arguments: args });

function dialogueFromText(text: string, characters: string[]): { speaker: string; text: string }[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => /^[—–-]\s*\S/.test(l))
    .map((l) => l.replace(/^[—–-]\s*/, '').split(/\s[—–]\s?/)[0]!.trim())
    .filter(Boolean);
  const cast = characters.length ? characters : ['narrador'];
  return lines.slice(0, 8).map((t, i) => ({ speaker: cast[i % cast.length]!, text: t }));
}

/** Propuestas dramatúrgicas para un beat (tarjetas de dirección). */
export function suggestForBeat(nodeId: string, text: string, options: { characters?: string[]; node?: StoryNode } = {}): PitchSuggestion[] {
  const analysis = analyzeBeat(text);
  const out: PitchSuggestion[] = [];
  const node = options.node;
  const tone = analysis.dominantTone ? TONE_LABELS[analysis.dominantTone].toLowerCase() : null;
  const te = node?.typographic_engine;
  const already: Record<string, boolean> = {
    narrow_corridor: te?.layout_mode === 'narrow_corridor',
    heartbeat_tremor: !!te?.heartbeat_sync?.enabled,
    flashlight_mask: !!te?.flashlight_reveal?.enabled || te?.layout_mode === 'flashlight_mask',
    melt_text: !!te?.melt?.enabled || te?.layout_mode === 'melt_text',
    visual_novel: !!node?.visual_novel_overlay?.enabled,
    cipher_lock: !!node?.gameplay_overlay,
    crt_terminal: !!node?.gameplay_overlay,
  };
  for (const cue of analysis.cues) {
    if (already[cue]) continue;
    switch (cue) {
      case 'narrow_corridor':
        out.push({
          id: `${nodeId}:narrow`,
          title: 'Estrechar la página',
          rationale: 'He detectado claustrofobia creciente. ¿Comprimimos la columna de texto para que el lector sienta las paredes?',
          calls: [call('setTypographicEffect', { node_id: nodeId, effect_type: 'narrow_corridor', parameters: { column_width_rem: 24 } })],
        });
        break;
      case 'heartbeat_tremor':
        out.push({
          id: `${nodeId}:pulse`,
          title: 'Latir con el personaje',
          rationale: 'La tensión sube. Propongo que la tipografía tiemble al ritmo de un pulso acelerado.',
          calls: [call('setTypographicEffect', { node_id: nodeId, effect_type: 'heartbeat_tremor', parameters: { bpm: 104, amplitude: 0.025 } })],
        });
        break;
      case 'flashlight_mask':
        out.push({
          id: `${nodeId}:dark`,
          title: 'Leer a oscuras',
          rationale: 'La escena transcurre en penumbra. ¿Dejamos el texto a oscuras para que el lector lo descubra con una linterna?',
          calls: [call('setTypographicEffect', { node_id: nodeId, effect_type: 'flashlight_mask', parameters: { radius_px: 170 } })],
        });
        break;
      case 'melt_text':
        out.push({
          id: `${nodeId}:melt`,
          title: 'Que la cordura se derrita',
          rationale: 'El narrador pierde pie. Las palabras podrían derretirse lentamente hacia el final del pasaje.',
          calls: [call('setTypographicEffect', { node_id: nodeId, effect_type: 'melt_text', parameters: { intensity: 0.45, duration_ms: 9000 } })],
        });
        break;
      case 'visual_novel': {
        const lines = dialogueFromText(text, options.characters ?? []);
        if (lines.length)
          out.push({
            id: `${nodeId}:dialogue`,
            title: 'Escenificar el diálogo',
            rationale: 'Este pasaje es casi todo conversación. ¿Lo convertimos en un careo con retratos y voces?',
            calls: [call('setVisualNovelSegment', { node_id: nodeId, speakers: [], dialogue_tree: lines })],
          });
        break;
      }
      case 'cipher_lock': {
        const code = text.match(/\b\d{3,6}\b/)?.[0] ?? '0000';
        out.push({
          id: `${nodeId}:lock`,
          title: 'Un enigma jugable',
          rationale: 'Aquí hay una clave por descubrir. Propongo una cerradura de combinación que el lector deba abrir.',
          calls: [call('mountSimulatedModule', { node_id: nodeId, module_type: 'cipher_lock', config: { target_code: code, prompt_text: 'INTRODUZCA LA COMBINACIÓN:' } })],
        });
        break;
      }
      case 'crt_terminal':
        out.push({
          id: `${nodeId}:terminal`,
          title: 'Una terminal viva',
          rationale: 'Aparece un aparato. El lector podría teclear en una terminal de fósforo verde.',
          calls: [call('mountSimulatedModule', { node_id: nodeId, module_type: 'crt_terminal', config: { boot_lines: ['SISTEMA LISTO.'], files: {} } })],
        });
        break;
    }
  }
  // Sonidos mencionados en la prosa con su posición implícita.
  const norm = normalizeText(text);
  for (const [re, file, label] of SOUND_NOUNS) {
    if (!re.test(norm) || out.length >= 5) continue;
    if (node?.acoustic_events.some((e) => e.asset.includes(file) || normalizeText(e.label ?? e.event_id).includes(normalizeText(label).trim()))) continue;
    const reading = parseSpatialDescription(text);
    out.push({
      id: `${nodeId}:sound:${file}`,
      title: `Dar cuerpo al sonido: ${label}`,
      rationale: `La prosa menciona ${label}. ¿Lo situamos en el espacio para escucharlo con auriculares${tone ? ` y reforzar la ${tone}` : ''}?`,
      calls: [
        call('placeSpatialAudio', {
          node_id: nodeId,
          asset_path: `assets/audio/sfx/${file}.ogg`,
          label,
          ...(reading.understood ? { coordinates: reading.coordinates } : { position_description: 'a la derecha a 3 metros' }),
          loop: /gotera|lluvia|viento|reloj|latido/.test(label.normalize('NFD').replace(/[̀-ͯ]/g, '')),
        }),
      ],
    });
    break;
  }
  return out;
}

/** Interpreta una indicación del autor en lenguaje natural y la traduce a herramientas. */
export function interpretInstruction(message: string, nodeId: string, nodeText = '', characters: string[] = []): ToolCall[] {
  const t = normalizeText(message);
  const calls: ToolCall[] = [];
  const effect = (effect_type: string, parameters: Record<string, unknown> = {}) =>
    calls.push(call('setTypographicEffect', { node_id: nodeId, effect_type, parameters }));

  if (/estrech|comprim|angost|claustrof|asfixi/.test(t)) effect('narrow_corridor', { column_width_rem: 24 });
  if (/tiembl|pulso|latid|corazon/.test(t)) effect('heartbeat_tremor', { bpm: Number(t.match(/(\d{2,3})\s*(?:bpm|pulsaciones)/)?.[1] ?? 100) });
  if (/derrit|licu|funda/.test(t)) effect('melt_text', { intensity: 0.5 });
  if (/oscur|linterna|a ciegas|penumbra/.test(t)) effect('flashlight_mask');
  if (/caig|caer|gravedad|desplom/.test(t)) effect('physics_fall');
  if (/espejo|invert|al reves|boca abajo/.test(t)) effect('mirror_inverted', { axis: /boca abajo|vertical/.test(t) ? 'y' : 'x' });

  if (/dialogo|novela visual|careo|retrato/.test(t)) {
    const lines = dialogueFromText(nodeText, characters);
    if (lines.length) calls.push(call('setVisualNovelSegment', { node_id: nodeId, speakers: [], dialogue_tree: lines }));
  }
  if (/terminal|consola|ordenador/.test(t)) calls.push(call('mountSimulatedModule', { node_id: nodeId, module_type: 'crt_terminal', config: {} }));
  if (/cerradura|combinacion|candado|codigo/.test(t)) {
    const code = message.match(/\b\d{3,8}\b/)?.[0] ?? nodeText.match(/\b\d{3,8}\b/)?.[0] ?? '0000';
    calls.push(call('mountSimulatedModule', { node_id: nodeId, module_type: 'cipher_lock', config: { target_code: code } }));
  }
  if (/circuito|cables|cableado/.test(t)) calls.push(call('mountSimulatedModule', { node_id: nodeId, module_type: 'circuit_puzzle', config: {} }));

  const reading = parseSpatialDescription(message);
  const sound = SOUND_NOUNS.find(([re]) => re.test(t));
  if (sound || (reading.understood && /suen|oig|escuch|sonido|ruido|audio|pon /.test(t))) {
    const [, file, label] = sound ?? [null, 'sound', 'sonido'];
    calls.push(
      call('placeSpatialAudio', {
        node_id: nodeId,
        asset_path: `assets/audio/sfx/${file}.ogg`,
        label,
        position_description: message,
        loop: /bucle|constante|sin parar|goteo|gotera/.test(t),
        trigger_event: /cuando lea|al leer|a mitad/.test(t) ? 'on_text_reveal' : 'on_enter',
      }),
    );
  }
  if (/continuidad|contradic|coheren|revisa/.test(t)) {
    calls.push(call('validateContinuity', { proposed_action: nodeText || message, target_nodes: [nodeId] }));
  }
  return calls;
}

export class LocalDirectorProvider implements LlmProvider {
  readonly kind = 'local' as const;
  readonly model = 'director-local';

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const last = request.messages.at(-1);
    const available = new Set(request.tools.map((t) => t.name));

    if (last?.role === 'tool') {
      // Cierre del turno: se resume lo realizado a partir de los resultados.
      const results = [];
      for (let i = request.messages.length - 1; i >= 0 && request.messages[i]!.role === 'tool'; i--) results.unshift(request.messages[i]!);
      const failed = results.filter((r) => r.role === 'tool' && r.isError).length;
      return {
        content: failed
          ? 'He preparado la propuesta, aunque alguna indicación no pudo aplicarse. Revísala antes de aprobarla.'
          : 'Propuesta lista. Obsérvala en la vista previa y decide si la aplicas.',
        toolCalls: [],
        stopReason: 'stop',
      };
    }

    const message = last?.role === 'user' ? last.content : '';
    const ctx = request.context ?? {};
    const nodeId = ctx.nodeId ?? 'nodo_001';
    let calls = interpretInstruction(message, nodeId, ctx.nodeText, ctx.characters);
    if (!calls.length && ctx.nodeText && /propon|sugier|analiz|ideas|que harias|dirige|mejora/.test(normalizeText(message))) {
      calls = suggestForBeat(nodeId, ctx.nodeText, { characters: ctx.characters ?? [] }).flatMap((s) => s.calls);
    }
    calls = calls.filter((c) => available.has(c.name));
    if (!calls.length) {
      return {
        content:
          'Puedo estrechar la página, hacer latir o derretir el texto, dejarlo a oscuras, escenificar un diálogo, montar una cerradura o una terminal, o situar un sonido en el espacio («una gotera a la derecha a 3 metros»). ¿Qué te gustaría?',
        toolCalls: [],
        stopReason: 'stop',
      };
    }
    return { content: '', toolCalls: calls, stopReason: 'tool_calls' };
  }
}
