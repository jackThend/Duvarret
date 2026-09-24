/** Generador pseudoaleatorio determinista (mulberry32): el mismo manifiesto, la misma experiencia. */
export function nextRandom(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  t = t >>> 0;
  return { value, state: t };
}

/** Hash FNV-1a de 32 bits para derivar semillas estables a partir de texto. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export interface DiceRoll {
  dice: [number, number];
  total: number;
  state: number;
}

/** Tira 2d6 (sistema de chequeos al estilo Disco Elysium). */
export function roll2d6(state: number): DiceRoll {
  const a = nextRandom(state);
  const b = nextRandom(a.state);
  const d1 = 1 + Math.floor(a.value * 6);
  const d2 = 1 + Math.floor(b.value * 6);
  return { dice: [d1, d2], total: d1 + d2, state: b.state };
}

/** Probabilidad exacta de que 2d6 + modificador alcance la dificultad. */
export function successProbability(modifier: number, difficulty: number): number {
  let wins = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b + modifier >= difficulty) wins++;
  return wins / 36;
}
