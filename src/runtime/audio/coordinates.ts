/**
 * Sistema de coordenadas acústicas de Duvarret (doc 02 §5.2):
 *   X: izquierda (−) → derecha (+) · Y: abajo (−) → arriba (+) · Z: atrás (−) → adelante (+)
 * En metros, relativo al centro de la cabeza del oyente (0,0,0).
 *
 * Web Audio mira por defecto hacia −Z, así que al entregar posiciones al motor se invierte Z.
 */
import type { Coordinates } from '@/core/manifest';

export const MAX_DISTANCE_M = 60;

export function sanitizeCoordinates(c: Partial<Coordinates> | undefined): Coordinates {
  const safe = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-MAX_DISTANCE_M, Math.min(MAX_DISTANCE_M, v)) : 0);
  return { x: safe(c?.x), y: safe(c?.y), z: safe(c?.z) };
}

export function toWebAudio(c: Coordinates): [number, number, number] {
  return [c.x, c.y, -c.z];
}

export function distance(c: Coordinates): number {
  return Math.hypot(c.x, c.y, c.z);
}

/** Azimut en grados: 0 = delante, 90 = derecha, 180 = detrás, −90 = izquierda. */
export function azimuthDeg(c: Coordinates): number {
  return (Math.atan2(c.x, c.z) * 180) / Math.PI;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');

/** Descripción en lenguaje natural (accesibilidad y radar): «a 3,5 m, a la derecha y detrás, arriba». */
export function describePosition(c: Coordinates): string {
  const d = distance(c);
  if (d < 0.3) return 'junto a tu oído';
  const parts: string[] = [];
  const lateral = Math.abs(c.x) >= 0.5 ? (c.x > 0 ? 'a la derecha' : 'a la izquierda') : '';
  const depth = Math.abs(c.z) >= 0.5 ? (c.z > 0 ? 'delante' : 'detrás') : '';
  if (lateral && depth) parts.push(`${lateral} y ${depth}`);
  else if (lateral || depth) parts.push(lateral || depth);
  if (Math.abs(c.y) >= 0.8) parts.push(c.y > 0 ? 'arriba' : 'abajo');
  return `a ${fmt(d)} m${parts.length ? `, ${parts.join(', ')}` : ''}`;
}

/** Proyección al plano orbital del radar (vista cenital): devuelve fracciones [-1, 1]. */
export function toRadar(c: Coordinates, rangeM: number): { rx: number; ry: number } {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return { rx: clamp(c.x / rangeM), ry: clamp(-c.z / rangeM) };
}

export function fromRadar(rx: number, ry: number, rangeM: number, y = 0): Coordinates {
  const round = (v: number) => Math.round(v * 10) / 10 + 0;
  return { x: round(rx * rangeM), y, z: round(-ry * rangeM) };
}
