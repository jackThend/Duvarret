import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useStoryStore } from './story';
import { sampleManifest } from '../__fixtures__/sample';
import { roll2d6, successProbability } from '../engine/rng';

describe('useStoryStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  const started = () => {
    const store = useStoryStore();
    store.load(sampleManifest());
    store.start();
    return store;
  };

  it('arranca en el primer nodo y aplica flags de entrada', () => {
    const store = started();
    expect(store.currentNodeId).toBe('inicio');
    expect(store.status).toBe('reading');
    expect(store.flags).toContain('entro_bunker');
    expect(store.inventory).toEqual(['sobre_lacrado']);
    expect(store.history).toEqual(['inicio']);
  });

  it('filtra las elecciones por condiciones', () => {
    const store = started();
    // percepcion 4 + 2d6 >= 6 siempre se cumple → la rejilla es visible; "Retroceder" está vedado.
    expect(store.passiveResults[0]?.passed).toBe(true);
    expect(store.revealedExtraTexts).toEqual(['Percibes una brisa tibia.']);
    expect(store.availableChoices.map((c) => c.choice.target_node)).toEqual(['rejilla']);
    expect(store.choose(1)).toBe(false);
    expect(store.choose(0)).toBe(true);
    expect(store.currentNodeId).toBe('rejilla');
  });

  it('bloquea el avance hasta resolver el minijuego obligatorio', () => {
    const store = started();
    store.advance();
    expect(store.currentNodeId).toBe('consola');
    expect(store.puzzlePending).toBe(true);
    expect(store.canAdvance).toBe(false);
    expect(store.advance()).toBe(false);
    store.resolvePuzzle(true);
    expect(store.flags).toContain('alarma_desactivada');
    expect(store.currentNodeId).toBe('final');
    expect(store.isEnding).toBe(true);
    store.advance();
    expect(store.status).toBe('ended');
  });

  it('aplica el desenlace de fracaso', () => {
    const store = started();
    store.advance();
    store.resolvePuzzle(false);
    expect(store.flags).toContain('alarma_disparada');
    expect(store.flags).not.toContain('alarma_desactivada');
  });

  it('emite eventos acústicos y dispara umbrales una sola vez', () => {
    const store = useStoryStore();
    store.load(sampleManifest());
    const events: string[] = [];
    store.on((e) => events.push(`${e.type}:${e.value ?? ''}`));
    store.start();
    store.setRevealProgress(30);
    store.setRevealProgress(65);
    store.setRevealProgress(70);
    store.setRevealProgress(100);
    expect(events).toEqual(['on_node_enter:', 'on_text_reveal_percentage:60', 'on_text_complete:']);
  });

  it('aísla los errores de los oyentes', () => {
    const store = useStoryStore();
    store.load(sampleManifest());
    store.on(() => {
      throw new Error('fallo de audio');
    });
    expect(() => store.start()).not.toThrow();
    expect(store.warnings[0]).toContain('fallo de audio');
  });

  it('no se rompe ante escenas inexistentes', () => {
    const store = started();
    expect(store.goTo('fantasma')).toBe(false);
    expect(store.currentNodeId).toBe('inicio');
    expect(store.warnings.at(-1)).toContain('fantasma');
  });

  it('es determinista: misma semilla, mismos dados', () => {
    const a = started().rollActiveCheck(1);
    setActivePinia(createPinia());
    const b = started().rollActiveCheck(1);
    expect(a).toEqual(b);
    expect(a?.probability).toBeCloseTo(successProbability(1, 9));
  });

  it('guarda y restaura partidas', () => {
    const store = started();
    store.advance();
    const snap = store.snapshot();
    store.resolvePuzzle(true);
    store.restore(snap);
    expect(store.currentNodeId).toBe('consola');
    expect(store.flags).not.toContain('alarma_desactivada');
    expect(store.solvedPuzzles).toEqual([]);
  });

  it('valida el manifiesto al cargarlo', () => {
    const store = useStoryStore();
    store.load({ nodes: [{ text_payload: 'Sin nombre' }] });
    store.start();
    expect(store.currentNodeId).toBe('nodo_001');
  });

  it('activa el modo sin pantalla si la obra lo pide', () => {
    const store = useStoryStore();
    store.load({ metadata: { title: 'x' }, global_settings: { default_mode: 'audio_drama_screenless' }, nodes: [] });
    expect(store.mode).toBe('screenless');
    store.start();
    expect(store.status).toBe('ended');
  });

  it('registra diálogos en el historial', () => {
    const store = started();
    store.pushDialogue('sancho', '¡Pasos!');
    expect(store.backlog.at(-1)).toEqual({ nodeId: 'inicio', speaker: 'sancho', text: '¡Pasos!' });
  });

  it('notifica el titubeo entre caminos', () => {
    const store = started();
    const spy = vi.fn();
    store.on(spy);
    store.hoverChoice(0);
    expect(spy).toHaveBeenCalledWith({ type: 'on_choice_hover', nodeId: 'inicio', value: 0 });
  });
});

describe('rng', () => {
  it('2d6 produce valores en rango y probabilidades exactas', () => {
    let state = 123;
    for (let i = 0; i < 500; i++) {
      const r = roll2d6(state);
      expect(r.total).toBeGreaterThanOrEqual(2);
      expect(r.total).toBeLessThanOrEqual(12);
      state = r.state;
    }
    expect(successProbability(0, 2)).toBe(1);
    expect(successProbability(0, 13)).toBe(0);
    expect(successProbability(0, 7)).toBeCloseTo(21 / 36);
  });
});
