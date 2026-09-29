import { describe, expect, it } from 'vitest';
import { makeTrials, noiseBursts, scoreAnswers } from './listeningTest';

describe('prueba de escucha', () => {
  it('equilibra las direcciones y baraja de forma reproducible', () => {
    const trials = makeTrials(3, 42);
    expect(trials).toHaveLength(12);
    for (const d of ['delante', 'detras', 'izquierda', 'derecha']) expect(trials.filter((t) => t === d)).toHaveLength(3);
    expect(makeTrials(3, 42)).toEqual(trials);
  });

  it('puntúa aciertos, cada dirección y las confusiones delante/detrás', () => {
    const score = scoreAnswers([
      { expected: 'delante', heard: 'detras' },
      { expected: 'detras', heard: 'detras' },
      { expected: 'izquierda', heard: 'izquierda' },
      { expected: 'derecha', heard: 'derecha' },
    ]);
    expect(score).toMatchObject({ total: 4, hits: 3, accuracy: 0.75, frontBack: 1, passes: false });
    expect(score.byDirection).toEqual({ delante: 0, detras: 1, izquierda: 1, derecha: 1 });
  });

  it('el KPI exige más del 90 %', () => {
    const all = (n: number) => Array.from({ length: n }, () => ({ expected: 'izquierda' as const, heard: 'izquierda' as const }));
    expect(scoreAnswers([...all(9), { expected: 'delante', heard: 'detras' }]).passes).toBe(false);
    expect(scoreAnswers(all(10)).passes).toBe(true);
  });

  it('genera ruido de banda ancha acotado', () => {
    const samples = noiseBursts(8000);
    expect(samples.length).toBe(3 * 1440 + 2 * 960);
    expect(Math.max(...samples.map(Math.abs))).toBeLessThanOrEqual(0.5);
  });
});
