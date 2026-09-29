import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { DIRECTIONS } from '@/runtime/audio/listeningTest';
import ListeningTest from './ListeningTest.vue';

beforeEach(() => setActivePinia(createPinia()));

function fakeEngine() {
  const plays: { x: number; z: number }[] = [];
  return {
    plays,
    backendKind: 'resonance_3d' as const,
    init: vi.fn(async () => undefined),
    stop: vi.fn(),
    play: vi.fn(async (_asset: string, options: { coordinates?: { x?: number; z?: number } } = {}) => {
      plays.push({ x: options.coordinates?.x ?? 0, z: options.coordinates?.z ?? 0 });
      return null;
    }),
  };
}

const directionOf = ({ x, z }: { x: number; z: number }) =>
  (Object.entries(DIRECTIONS).find(([, c]) => c.x === x && c.z === z)?.[0] ?? '') as keyof typeof DIRECTIONS;

describe('Prueba de escucha 3D', () => {
  it('suena desde cada dirección, no deja responder sin escuchar y puntúa al final', async () => {
    const engine = fakeEngine();
    const w = mount(ListeningTest, { props: { engine: engine as never } });
    await w.get('[data-testid="listening-start"]').trigger('click');
    expect(w.get('[data-testid="listening-delante"]').attributes('disabled')).toBeDefined();
    for (let i = 0; i < 12; i++) {
      await w.get('[data-testid="listening-play"]').trigger('click');
      await flushPromises();
      // Acierta todas menos la primera, que confunde delante y detrás.
      const truth = directionOf(engine.plays.at(-1)!);
      const heard = i === 0 ? ({ delante: 'detras', detras: 'delante', izquierda: 'derecha', derecha: 'izquierda' } as const)[truth] : truth;
      await w.get(`[data-testid="listening-${heard}"]`).trigger('click');
    }
    expect(new Set(engine.plays.map(directionOf)).size).toBe(4);
    expect(w.get('[data-testid="listening-score"]').text()).toBe('11 de 12 (92 %)');
    expect(w.get('[data-testid="listening-verdict"]').text()).toContain('Supera');
  });
});
