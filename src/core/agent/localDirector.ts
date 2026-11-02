/**
 * Director local heurístico: implementa la misma interfaz que un modelo de lenguaje, pero de
 * forma determinista y 100% offline. Garantiza que Duvarret funcione sin conexión ni claves
 * (RNF-04) y sirve de base para las propuestas proactivas (Pitch Cards).
 */
import { analyzeBeat, normalizeText, TONE_LABELS } from '../ingest/toneAnalyzer';
import { parseSpatialDescription } from './spatialLanguage';
import type { StoryNode } from '../manifest';
import { SCENE_CAPABILITIES } from './sceneCapabilities';
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
  [/grillo/, 'crickets', 'grillos'],
  [/perro|ladrido/, 'dog_bark', 'ladrido'],
  [/disparo|\btiro\b/, 'gunshot', 'disparo'],
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
  const norm = normalizeText(text);
  if (!node?.gameplay_overlay && /ganzua|forzar.{0,35}cerradura/.test(norm)) {
    out.push({ id: `${nodeId}:lockpick`, title: 'Abrir con ganzúa', rationale: 'La cerradura puede convertirse en una prueba de tacto y tensión: ajustar tres pernos antes de agotar los intentos.', calls: [call('mountSimulatedModule', { node_id: nodeId, module_type: 'lockpick', config: { pin_heights: [1, 3, 2], max_attempts: 5 } })] });
  } else if (!node?.gameplay_overlay && /linterna/.test(norm) && /buscar|encontr|recog|registr|inventario/.test(norm)) {
    out.push({ id: `${nodeId}:room-search`, title: 'Buscar con la linterna', rationale: 'Podemos explorar una habitación ilustrada y recoger un hallazgo para el inventario. Habrá que aportar la imagen del cuarto.', calls: searchRoomCalls(nodeId, text) });
  }
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
        if (out.some(s => s.id.endsWith(':lockpick') || s.id.endsWith(':room-search'))) break;
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

function searchRoomCalls(nodeId: string, text: string): ToolCall[] {
  const itemId = `hallazgo_${nodeId}`;
  const image = text.match(/assets\/images\/[\w./-]+\.(?:svg|png|webp|jpg|jpeg)/i)?.[0] ?? 'assets/images/habitacion.svg';
  const label = text.match(/[«“"]([^»”"]{1,60})[»”"]/)?.[1] ?? 'Objeto encontrado';
  return [
    call('defineInventoryItem', { item_id: itemId, name: label, description: 'Un objeto descubierto al registrar la habitación.' }),
    call('mountSimulatedModule', { node_id: nodeId, module_type: 'room_search', config: { image, item_label: label, item_x: 72, item_y: 64, radius_px: 120, on_success: { grant_items: [itemId] } } }),
  ];
}

/** Réplica entre comillas que el autor quiere oír dicha: «ponme una voz que susurre "no mires atrás"». */
function spokenLine(message: string): { text: string; manner: string } | null {
  const quoted = message.match(/[«"“]([^»"”]+)[»"”]/)?.[1]?.trim();
  const t = normalizeText(message.replace(/[«"“][^»"”]*[»"”]/g, ' '));
  if (!quoted || !/\bvoz\b|susurr|dig[ae]|grit|murmur|hable|pronunci|recit/.test(t)) return null;
  const manner = /susurr/.test(t) ? 'susurrando' : /grit/.test(t) ? 'gritando' : /murmur/.test(t) ? 'murmurando' : 'natural';
  return { text: quoted, manner };
}

const SECOND_WORDS: Record<string, number> = { medio: 0.5, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, quince: 15, veinte: 20, treinta: 30 };

/** «dos segundos después», «al cabo de 3 segundos», «tras medio segundo» → milisegundos. */
function delayFrom(t: string): number | undefined {
  const match = t.match(/\b(?:al cabo de |tras |pasados |a los )?(\d+(?:[.,]\d+)?|[a-z]+) segundos?(?: (?:despues|mas tarde|luego))?/);
  if (!match || !/(al cabo de|tras|pasados|a los|despues|mas tarde|luego)/.test(match[0])) return undefined;
  const raw = match[1]!;
  const seconds = /\d/.test(raw) ? Number(raw.replace(',', '.')) : SECOND_WORDS[raw];
  return seconds && seconds > 0 && seconds <= 120 ? Math.round(seconds * 1000) : undefined;
}

/** Qué sonido pide el autor y cómo colocarlo; `query` es lo que se busca en el banco libre (en inglés, su idioma más rico). */
function soundRequest(message: string, t = normalizeText(message)) {
  const reading = parseSpatialDescription(message);
  const noun = SOUND_NOUNS.find(([re]) => re.test(t));
  if (!noun && !(reading.understood && /suen|oig|escuch|sonido|ruido|audio|pon /.test(t))) return null;
  // «justo en «disparó»», «cuando lea «disparó»»: el sonido espera a esa palabra del texto.
  const quoted = message.match(/[«"“]([^»"”]{1,40})[»"”]/)?.[1]?.trim();
  const atWord = quoted && /palabra|justo en|cuando lea|al leer|al llegar a|cuando llegue/.test(t) ? quoted : undefined;
  return {
    query: noun ? noun[1].replace(/_/g, ' ') : null,
    /** Ruta reservada de siempre si no hay generador que lo busque. */
    fallback: `assets/audio/sfx/${noun?.[1] ?? 'sound'}.ogg`,
    placement: {
      label: noun?.[2] ?? 'sonido',
      position_description: message,
      loop: /bucle|constante|sin parar|goteo|gotera/.test(t),
      trigger_event: /cuando lea|al leer|a mitad/.test(t) ? 'on_text_reveal' : 'on_enter',
      ...(atWord ? { at_word: atWord } : {}),
      ...(delayFrom(t) ? { delay_ms: delayFrom(t) } : {}),
    },
  };
}

/** Interpreta una indicación del autor en lenguaje natural y la traduce a herramientas. */
export function interpretInstruction(message: string, nodeId: string, nodeText = '', characters: string[] = []): ToolCall[] {
  const spoken = spokenLine(message);
  // Lo que dirá la voz no son indicaciones: «no mires atrás» no pide nada a la tipografía.
  const t = normalizeText(spoken ? message.replace(/[«"“][^»"”]*[»"”]/g, ' ') : message);
  const calls: ToolCall[] = [];
  const searchRoom = /linterna/.test(t) && /habitacion|cuarto|buscar|objeto|inventario|recog|encontr/.test(t);
  const lockpick = /ganzua|forzar.{0,35}cerradura/.test(t);
  const effect = (effect_type: string, parameters: Record<string, unknown> = {}) =>
    calls.push(call('setTypographicEffect', { node_id: nodeId, effect_type, parameters }));

  if (/estrech|comprim|angost|claustrof|asfixi/.test(t)) effect('narrow_corridor', { column_width_rem: 24 });
  if (/tiembl|pulso|latid|corazon/.test(t)) effect('heartbeat_tremor', { bpm: Number(t.match(/(\d{2,3})\s*(?:bpm|pulsaciones)/)?.[1] ?? 100) });
  if (/derrit|licu|funda/.test(t)) effect('melt_text', { intensity: 0.5 });
  if (!searchRoom && /oscur|linterna|a ciegas|penumbra/.test(t)) effect('flashlight_mask');
  if (/caig|caer|gravedad|desplom/.test(t)) effect('physics_fall');
  if (/espejo|invert|al reves|boca abajo/.test(t)) effect('mirror_inverted', { axis: /boca abajo|vertical/.test(t) ? 'y' : 'x' });

  if (/dialogo|novela visual|careo|retrato/.test(t)) {
    const lines = dialogueFromText(nodeText, characters);
    if (lines.length) calls.push(call('setVisualNovelSegment', { node_id: nodeId, speakers: [], dialogue_tree: lines }));
  }
  if (/terminal|consola|ordenador/.test(t)) calls.push(call('mountSimulatedModule', { node_id: nodeId, module_type: 'crt_terminal', config: {} }));
  if (searchRoom) calls.push(...searchRoomCalls(nodeId, message));
  else if (lockpick) calls.push(call('mountSimulatedModule', { node_id: nodeId, module_type: 'lockpick', config: { pin_heights: [1, 3, 2], max_attempts: 5 } }));
  else if (/cerradura|combinacion|candado|codigo/.test(t)) {
    const code = message.match(/\b\d{3,8}\b/)?.[0] ?? nodeText.match(/\b\d{3,8}\b/)?.[0] ?? '0000';
    calls.push(call('mountSimulatedModule', { node_id: nodeId, module_type: 'cipher_lock', config: { target_code: code } }));
  }
  if (/circuito|cables|cableado/.test(t)) calls.push(call('mountSimulatedModule', { node_id: nodeId, module_type: 'circuit_puzzle', config: {} }));

  const sound = soundRequest(message, t);
  if (spoken) {
    // Primero se crea la voz; su colocación llega cuando se conoce la ruta (ver `complete`).
    calls.push(call('requestAssetSynthesis', { type: 'voice', prompt: spoken.text, style_preset: spoken.manner }));
  } else if (sound?.query) {
    // Un sonido reconocible se busca en el banco libre (o queda reservado) y se coloca después.
    calls.push(call('requestAssetSynthesis', { type: 'sfx', prompt: sound.query, style_preset: 'natural' }));
  } else if (sound) {
    calls.push(call('placeSpatialAudio', { node_id: nodeId, asset_path: sound.fallback, ...sound.placement }));
  }
  if (/continuidad|contradic|coheren|revisa/.test(t)) {
    calls.push(call('validateContinuity', { proposed_action: nodeText || message, target_nodes: [nodeId] }));
  }
  return calls;
}

/**
 * Tras crear una voz o encontrar un sonido, lo sitúa donde el autor pidió («a mi oído derecho»).
 * Una voz sin indicación queda muy cerca y delante; un sonido reservado también se coloca, para que
 * el autor vea qué falta y lo aporte.
 */
function placeCreatedAsset(request: CompletionRequest): ToolCall | null {
  const messages = request.messages;
  let userIndex = messages.length - 1;
  while (userIndex >= 0 && messages[userIndex]!.role !== 'user') userIndex--;
  const turn = messages.slice(userIndex + 1);
  const calls = turn.flatMap((m) => (m.role === 'assistant' ? (m.toolCalls ?? []) : []));
  if (calls.some((c) => c.name === 'placeSpatialAudio')) return null;
  for (const message of turn) {
    if (message.role !== 'tool' || message.name !== 'requestAssetSynthesis') continue;
    const asked = calls.find((c) => c.id === message.toolCallId);
    const type = asked?.arguments.type;
    if (type !== 'voice' && type !== 'sfx') continue;
    let result: { path?: string; status?: string } | null = null;
    try { result = JSON.parse(message.content) as { path?: string; status?: string } | null; } catch { /* resultado ilegible */ }
    const created = !message.isError && !!result?.path && ['ready', 'draft', 'pending'].includes(result.status ?? '');
    const author = messages[userIndex];
    const where = author?.role === 'user' ? author.content : '';
    const node_id = request.context?.nodeId ?? 'nodo_001';
    if (type === 'sfx') {
      // Sin generador, el sonido se coloca igual en su ruta reservada: el autor verá que falta y lo aportará.
      const sound = soundRequest(where);
      const asset_path = created ? result!.path : sound?.fallback;
      if (!asset_path) continue;
      return call('placeSpatialAudio', { node_id, asset_path, ...(sound?.placement ?? { label: 'sonido', position_description: where }) });
    }
    if (!created) continue;
    const said = String(asked!.arguments.prompt ?? '');
    return call('placeSpatialAudio', {
      node_id,
      asset_path: result!.path,
      label: `voz «${said.length > 40 ? `${said.slice(0, 40)}…` : said}»`,
      ...(parseSpatialDescription(where).understood ? { position_description: where } : { coordinates: { x: 0, y: 0, z: 0.6 } }),
      room_preset: 'small_study',
      acoustic_material: 'curtains',
      ...(delayFrom(normalizeText(where)) ? { delay_ms: delayFrom(normalizeText(where)) } : {}),
    });
  }
  return null;
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
      const placement = placeCreatedAsset(request);
      if (placement && available.has('placeSpatialAudio')) return { content: '', toolCalls: [placement], stopReason: 'tool_calls' };
      const failed = results.filter((r) => r.role === 'tool' && r.isError).length;
      return {
        content: failed && failed === results.length
          ? 'No pude preparar esa propuesta.'
          : failed
          ? 'He preparado la propuesta, aunque alguna indicación no pudo aplicarse. Revísala antes de aprobarla.'
          : 'Propuesta lista. Obsérvala en la vista previa y decide si la aplicas.',
        toolCalls: [],
        stopReason: 'stop',
      };
    }

    const message = last?.role === 'user' ? last.content : '';
    const ctx = request.context ?? {};
    const nodeId = ctx.nodeId ?? 'nodo_001';
    if (/que (?:puedes|se puede) hacer|capacidades|tipos de escenas|que minijuegos/.test(normalizeText(message))) {
      return { content: `Puedo proponer ${SCENE_CAPABILITIES.map(c => c.title.toLowerCase()).join(', ')}, además de novela visual, efectos de letras y audio espacial. La búsqueda con linterna puede guardar un objeto en el inventario; necesita una imagen del cuarto. Tú decides qué aplicar.`, toolCalls: [], stopReason: 'stop' };
    }
    let calls = interpretInstruction(message, nodeId, ctx.nodeText, ctx.characters);
    if (!calls.length && ctx.nodeText && /propon|sugier|analiz|ideas|que harias|dirige|mejora/.test(normalizeText(message))) {
      calls = suggestForBeat(nodeId, ctx.nodeText, { characters: ctx.characters ?? [] }).flatMap((s) => s.calls);
    }
    calls = calls.filter((c) => available.has(c.name));
    if (!calls.length) {
      return {
        content:
          'Puedo proponer una ganzúa, buscar objetos con linterna para el inventario, un escritorio de expedientes, una combinación o una terminal; también novela visual, letras que se estrechan o derriten y audio espacial. ¿Qué te gustaría?',
        toolCalls: [],
        stopReason: 'stop',
      };
    }
    return { content: '', toolCalls: calls, stopReason: 'tool_calls' };
  }
}
