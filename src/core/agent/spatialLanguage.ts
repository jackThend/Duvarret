/**
 * Intérprete espacial (RF-11): traduce indicaciones cotidianas del autor
 * («el teléfono suena a la derecha a 3 metros», «unos pasos se acercan por detrás»)
 * a coordenadas cartesianas relativas al oyente P = (x, y, z) en metros.
 */
import type { Coordinates } from '../manifest';

export interface SpatialReading {
  coordinates: Coordinates;
  /** Distancia final (m). */
  distance: number;
  /** Movimiento sugerido por el verbo (se acerca / se aleja). */
  motion: 'approaching' | 'receding' | 'static';
  /** Fragmentos reconocidos, útiles para explicar la interpretación al autor. */
  matched: string[];
  /** `true` si se reconoció al menos una dirección o distancia. */
  understood: boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  medio: 0.5, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, veinte: 20, treinta: 30, cincuenta: 50, cien: 100,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20,
};

const DEFAULT_DISTANCE = 4;

const norm = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const round = (n: number) => Math.round(n * 100) / 100 + 0;

export function parseSpatialDescription(description: string): SpatialReading {
  const text = ` ${norm(description)} `;
  const matched: string[] = [];
  const dir = { x: 0, y: 0, z: 0 };
  const hit = (re: RegExp, apply: () => void) => {
    const m = text.match(re);
    if (m) {
      matched.push(m[0].trim());
      apply();
    }
  };

  // Susurros íntimos pegados a una oreja.
  const ear = text.match(/\b(?:en|junto a|al|a) (?:la |el )?(?:oreja|oido) (izquierd[oa]|derech[oa])/) ?? text.match(/\b(left|right) ear\b/);
  if (ear) {
    const side = ear[1]!.startsWith('izq') || ear[1] === 'left' ? -1 : 1;
    return { coordinates: { x: round(0.25 * side), y: 0, z: 0 }, distance: 0.25, motion: 'static', matched: [ear[0].trim()], understood: true };
  }

  hit(/\b(?:a|hacia|por|de) (?:la |su )?izquierda\b|\bleft\b/, () => (dir.x = -1));
  hit(/\b(?:a|hacia|por|de) (?:la |su )?derecha\b|\bright\b/, () => (dir.x = 1));
  hit(/\b(?:por |hacia |desde |de )?(?:detras|atras|a (?:mis|tus|sus|nuestras) espaldas|a la espalda)\b|\bbehind\b/, () => (dir.z = -1));
  hit(/\b(?:delante|enfrente|al frente|frente a)\b|\bin front\b|\bahead\b/, () => (dir.z = 1));
  hit(/\b(?:arriba|encima|sobre (?:nosotros|mi|ti|la cabeza)|en el techo|en lo alto|desde el cielo)\b|\babove\b/, () => (dir.y = 1));
  hit(/\b(?:abajo|debajo|bajo (?:el suelo|tierra|los pies)|en el suelo|en el sotano)\b|\bbelow\b/, () => (dir.y = -1));

  let distance: number | null = null;
  const numeric = text.match(/(\d+(?:[.,]\d+)?)\s*(?:m\b|mts?\b|metros?\b|meters?\b)/);
  const worded = text.match(/\b([a-z]+)\s+(?:metros?|meters?)\b/);
  if (numeric) {
    distance = Number(numeric[1]!.replace(',', '.'));
    matched.push(numeric[0].trim());
  } else if (worded && NUMBER_WORDS[worded[1]!] !== undefined) {
    distance = NUMBER_WORDS[worded[1]!]!;
    matched.push(worded[0].trim());
  } else if (/\b(?:muy lejos|a lo lejos|en la distancia|far away)\b/.test(text)) {
    distance = 15;
    matched.push('lejos');
  } else if (/\blejos\b|\bfar\b/.test(text)) {
    distance = 10;
    matched.push('lejos');
  } else if (/\b(?:muy cerca|pegad[oa]|junto a ti|close by)\b/.test(text)) {
    distance = 1;
    matched.push('muy cerca');
  } else if (/\bcerca\b|\bnear\b/.test(text)) {
    distance = 2;
    matched.push('cerca');
  }

  const motion: SpatialReading['motion'] = /\b(?:se acerca|se acercan|acercandose|aproxima|approach)/.test(text)
    ? 'approaching'
    : /\b(?:se aleja|se alejan|alejandose|recede)/.test(text)
      ? 'receding'
      : 'static';

  const magnitude = Math.hypot(dir.x, dir.y, dir.z);
  const understood = magnitude > 0 || distance !== null;
  const d = distance ?? DEFAULT_DISTANCE;
  if (magnitude === 0) {
    // Solo distancia: se sitúa delante del oyente.
    return { coordinates: { x: 0, y: 0, z: understood ? round(d) : 0 }, distance: understood ? d : 0, motion, matched, understood };
  }
  return {
    coordinates: { x: round((dir.x / magnitude) * d), y: round((dir.y / magnitude) * d), z: round((dir.z / magnitude) * d) },
    distance: d,
    motion,
    matched,
    understood,
  };
}
