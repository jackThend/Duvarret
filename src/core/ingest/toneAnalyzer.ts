/**
 * Análisis dramatúrgico de un beat (RF-01): tono emocional, espacialidad y candidatura de
 * interacción. Heurística léxica determinista y offline; un LLM puede refinarla después.
 */

export const TONES = ['intimidad', 'claustrofobia', 'peligro', 'solemnidad', 'humor', 'locura', 'oscuridad'] as const;
export type Tone = (typeof TONES)[number];

export const INTERACTIONS = ['dialogo', 'monologo', 'enigma', 'aparatos', 'narracion'] as const;
export type Interaction = (typeof INTERACTIONS)[number];

export const TONE_LABELS: Record<Tone, string> = {
  intimidad: 'Intimidad',
  claustrofobia: 'Claustrofobia',
  peligro: 'Peligro',
  solemnidad: 'Solemnidad',
  humor: 'Humor',
  locura: 'Delirio',
  oscuridad: 'Oscuridad',
};

const LEXICON: Record<Tone, string[]> = {
  intimidad: ['susurr', 'caricia', 'abraz', 'beso', 'ternura', 'amor', 'mano', 'piel', 'suave', 'confes', 'lagrima', 'querid'],
  claustrofobia: ['angost', 'estrech', 'encerr', 'asfixi', 'pasadizo', 'pasillo', 'tunel', 'paredes', 'respirar', 'aplast', 'ahog', 'sotano', 'celda', 'ataud', 'raspar', 'claustro'],
  peligro: ['sangre', 'grito', 'arma', 'cuchill', 'revolver', 'disparo', 'amenaz', 'huir', 'persegu', 'muerte', 'matar', 'asesin', 'miedo', 'terror', 'pasos', 'alarma', 'trampa', 'emboscad', 'latido', 'corazon'],
  solemnidad: ['catedral', 'solemn', 'silencio', 'eterno', 'sagrad', 'ceremoni', 'rey', 'juramento', 'tumba', 'funeral', 'campana', 'antigu'],
  humor: ['risa', 'rio ', 'carcajad', 'broma', 'burla', 'ridicul', 'absurd', 'gracios', 'chiste'],
  locura: ['locura', 'loco', 'delir', 'cordura', 'nervios', 'demente', 'alucin', 'frenet', 'enloquec', 'temblar', 'temblor', 'derreti', 'fiebre'],
  oscuridad: ['oscur', 'tiniebla', 'sombra', 'penumbra', 'negro', 'noche', 'linterna', 'vela', 'candil', 'lampara', 'ciego'],
};

const ENIGMA = ['clave', 'codigo', 'cerradura', 'candado', 'acertijo', 'enigma', 'cifra', 'contrasena', 'combinacion', 'pista', 'descifr', 'llave'];
const DEVICES = ['pantalla', 'terminal', 'consola', 'ordenador', 'computador', 'monitor', 'telefono', 'radio', 'telegrafo', 'teclado', 'cable', 'circuito'];
const INTROSPECTION = [' pense', ' pienso', ' recorde', ' recuerdo', ' senti', ' siento', ' me pregunt', ' yo ', ' mi alma', ' mis pensamientos', ' soñ', ' sone'];

export const normalizeText = (t: string) =>
  ` ${t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')} `;

export interface BeatAnalysis {
  tones: Record<Tone, number>;
  dominantTone: Tone | null;
  interaction: Interaction;
  dialogueRatio: number;
  /** Ideas de dirección derivadas del análisis. */
  cues: string[];
}

function count(text: string, stems: string[]): number {
  let n = 0;
  for (const stem of stems) {
    let i = text.indexOf(stem);
    while (i >= 0) {
      n++;
      i = text.indexOf(stem, i + stem.length);
    }
  }
  return n;
}

export function analyzeBeat(text: string): BeatAnalysis {
  const norm = normalizeText(text);
  const words = Math.max(1, text.split(/\s+/).filter(Boolean).length);
  const tones = Object.fromEntries(TONES.map((tone) => [tone, Math.min(1, (count(norm, LEXICON[tone]) / words) * 25)])) as Record<Tone, number>;
  const ranked = [...TONES].sort((a, b) => tones[b] - tones[a]);
  const dominantTone = tones[ranked[0]!] > 0.05 ? ranked[0]! : null;

  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const dialogueLines = lines.filter((l) => /^[—–-]\s*\S|^[«"“]/.test(l));
  const inlineDialogue = (text.match(/[—–]\s*[¡¿A-ZÁÉÍÓÚÑ][^—–\n]{2,}/g) ?? []).length;
  const dialogueRatio = lines.length ? Math.min(1, (dialogueLines.length + inlineDialogue * 0.5) / lines.length) : 0;

  const enigma = count(norm, ENIGMA);
  const devices = count(norm, DEVICES);
  const introspection = count(norm, INTROSPECTION);
  let interaction: Interaction = 'narracion';
  if (devices >= 2) interaction = 'aparatos';
  else if (enigma >= 2) interaction = 'enigma';
  else if (dialogueRatio >= 0.35) interaction = 'dialogo';
  else if (introspection / words > 0.01) interaction = 'monologo';

  const cues: string[] = [];
  if (tones.claustrofobia > 0.15) cues.push('narrow_corridor');
  if (tones.peligro > 0.2 || count(norm, ['latido', 'corazon', 'pulso']) >= 2) cues.push('heartbeat_tremor');
  if (tones.oscuridad > 0.2) cues.push('flashlight_mask');
  if (tones.locura > 0.2) cues.push('melt_text');
  if (interaction === 'dialogo') cues.push('visual_novel');
  if (interaction === 'enigma') cues.push('cipher_lock');
  if (interaction === 'aparatos') cues.push('crt_terminal');

  return { tones, dominantTone, interaction, dialogueRatio, cues };
}
