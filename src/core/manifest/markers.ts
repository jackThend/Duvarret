/**
 * Marcas de sonido dentro del texto (tarea 7 de docs/11): el autor escribe `⟦disparo⟧` justo
 * donde quiere oírlo. La marca viaja con el párrafo al reescribirlo y nunca se muestra ni se lee
 * en voz alta: el lector la retira al cargar la escena y conserva su posición.
 */
export const TEXT_MARKER = /⟦([^⟦⟧\n]{1,40})⟧/g;

export interface TextMarker {
  /** Nombre que el evento acústico cita en `trigger_marker`. */
  name: string;
  /** Posición en el texto visible (sin marcas), en caracteres. */
  index: number;
  /** Porcentaje del texto visible leído al llegar a la marca (0–100). */
  percentage: number;
}

/** Texto sin marcas y la posición de cada una. */
export function parseTextMarkers(text: string): { visible: string; markers: TextMarker[] } {
  const markers: Omit<TextMarker, 'percentage'>[] = [];
  let visible = '';
  let cursor = 0;
  for (const match of text.matchAll(TEXT_MARKER)) {
    visible += text.slice(cursor, match.index);
    markers.push({ name: match[1]!.trim(), index: visible.length });
    cursor = match.index! + match[0].length;
  }
  visible += text.slice(cursor);
  const length = Math.max(1, visible.length);
  return { visible, markers: markers.map((m) => ({ ...m, percentage: Math.round((m.index / length) * 1000) / 10 })) };
}

export const stripTextMarkers = (text: string) => text.replace(TEXT_MARKER, '');

/** Nombre de marca seguro y legible: «Disparo final» → «disparo final». */
export const markerName = (name: string) => name.replace(/[⟦⟧\n]/g, '').trim().toLowerCase().slice(0, 40);
