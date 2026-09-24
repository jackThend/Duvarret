import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { TolerantSchemas } from '@/core/manifest';
import { FakeAudioContext, fakeContextFactory } from '@/test/fakeAudio';
import { SpatialAudioEngine } from './SpatialAudioEngine';
import { azimuthDeg, describePosition, fromRadar, sanitizeCoordinates, toRadar, toWebAudio } from './coordinates';
import { synthesizeImpulse } from './impulse';
import { ROOM_MODELS } from './rooms';
import { useStoryStore } from '../stores/story';
import { sampleManifest } from '../__fixtures__/sample';

const loader = vi.fn(async (path: string) => (path.includes('missing') ? null : new ArrayBuffer(8)));
const flush = () => new Promise((r) => setTimeout(r, 0));

function engine(preferred: 'resonance_3d' | 'stereo_simple' | 'steam_audio_wasm' = 'steam_audio_wasm', ctx = new FakeAudioContext()) {
  const warnings: string[] = [];
  const e = new SpatialAudioEngine({
    preferred,
    contextFactory: fakeContextFactory(ctx).factory,
    loadAsset: loader,
    onWarning: (m) => warnings.push(m),
  });
  return { e, ctx, warnings };
}

describe('coordenadas', () => {
  it('convierte a la convención de Web Audio (adelante = −Z)', () => {
    expect(toWebAudio({ x: 3.5, y: 1.2, z: -4 })).toEqual([3.5, 1.2, 4]);
  });

  it('describe posiciones en lenguaje natural', () => {
    expect(describePosition({ x: 3, y: 0, z: 0 })).toBe('a 3 m, a la derecha');
    expect(describePosition({ x: -4, y: 5, z: -8 })).toBe('a 10,2 m, a la izquierda y detrás, arriba');
    expect(describePosition({ x: 0, y: 0, z: 0.1 })).toBe('junto a tu oído');
  });

  it('calcula el azimut', () => {
    expect(azimuthDeg({ x: 0, y: 0, z: 1 })).toBeCloseTo(0);
    expect(azimuthDeg({ x: 1, y: 0, z: 0 })).toBeCloseTo(90);
    expect(Math.abs(azimuthDeg({ x: 0, y: 0, z: -1 }))).toBeCloseTo(180);
  });

  it('proyecta al radar y vuelve (ida y vuelta)', () => {
    const c = { x: 2, y: 0, z: -5 };
    const { rx, ry } = toRadar(c, 10);
    expect(ry).toBeGreaterThan(0); // detrás = abajo en el radar
    expect(fromRadar(rx, ry, 10)).toEqual(c);
  });

  it('sanea coordenadas imposibles', () => {
    expect(sanitizeCoordinates({ x: Number.NaN, y: 1e9 })).toEqual({ x: 0, y: 60, z: 0 });
  });
});

describe('respuesta al impulso', () => {
  it('decae ~60 dB en RT60 y es determinista', () => {
    const room = ROOM_MODELS.cathedral_echo;
    const [l, r] = synthesizeImpulse(room, 4000);
    const [l2] = synthesizeImpulse(room, 4000);
    expect(l).toEqual(l2);
    expect(l).not.toEqual(r); // canales decorrelados
    const rms = (a: Float32Array, from: number, to: number) => Math.sqrt(a.slice(from, to).reduce((s, v) => s + v * v, 0) / (to - from));
    const early = rms(l, 200, 600);
    const late = rms(l, l.length - 400, l.length);
    expect(early / late).toBeGreaterThan(100);
  });

  it('respeta el pre-retardo', () => {
    const [l] = synthesizeImpulse(ROOM_MODELS.outdoor_field, 8000);
    expect(l.slice(0, 400).every((v) => v === 0)).toBe(true);
  });
});

describe('SpatialAudioEngine', () => {
  beforeEach(() => {
    loader.mockClear();
  });

  it('posiciona fuentes con HRTF y reverberación de sala', async () => {
    const { e, ctx } = engine();
    e.setRoom('narrow_concrete_corridor', 'concrete');
    const voice = await e.play('assets/audio/drip.ogg', { id: 'gotera', coordinates: { x: 3.5, y: 1.2, z: -4 }, loop: true, gain: 0.75 });
    expect(e.backendKind).toBe('hrtf_native');
    const panner = ctx.byKind('panner')[0];
    expect(panner.panningModel).toBe('HRTF');
    expect([panner.positionX.value, panner.positionY.value, panner.positionZ.value]).toEqual([3.5, 1.2, 4]);
    expect(ctx.byKind('convolver')[0].buffer).not.toBeNull();
    expect(ctx.byKind('biquad')[0].frequency.value).toBe(12000);
    const source = ctx.byKind('buffer')[0];
    expect(source.loop).toBe(true);
    expect(source.started).toBe(0);
    expect(voice?.placeholder).toBe(false);
    expect(e.active.map((v) => v.id)).toEqual(['gotera']);
  });

  it('reproduce un tono de prueba si falta el asset', async () => {
    const { e, ctx, warnings } = engine();
    const voice = await e.play('assets/audio/missing.ogg');
    expect(voice?.placeholder).toBe(true);
    expect(ctx.byKind('oscillator')[0].stoppedAt).toBeCloseTo(0.25);
    expect(warnings[0]).toContain('tono de prueba');
  });

  it('también ante audio corrupto', async () => {
    const ctx = new FakeAudioContext();
    ctx.failDecode = true;
    const { e } = engine('steam_audio_wasm', ctx);
    expect((await e.play('assets/audio/roto.ogg'))?.placeholder).toBe(true);
  });

  it('degrada a estéreo simple', async () => {
    const { e, ctx } = engine('stereo_simple');
    await e.play('a.ogg', { coordinates: { x: 4, y: 0, z: 0 } });
    expect(e.backendKind).toBe('stereo_simple');
    expect(ctx.byKind('stereo')[0].pan.value).toBe(1);
  });

  it('usa Resonance Audio cuando está disponible y recurre a HRTF si falla', async () => {
    const ctx = new FakeAudioContext();
    const setRoom = vi.fn();
    const ok = new SpatialAudioEngine({
      preferred: 'resonance_3d',
      contextFactory: fakeContextFactory(ctx).factory,
      loadAsset: loader,
      resonanceFactory: async () => ({
        kind: 'resonance_3d',
        createVoice: () => ({ input: ctx.createGain() as unknown as AudioNode, setPosition: vi.fn(), dispose: vi.fn() }),
        setRoom,
        dispose: vi.fn(),
      }),
    });
    ok.setRoom('cathedral_echo', 'stone');
    await ok.init();
    expect(ok.backendKind).toBe('resonance_3d');
    expect(setRoom).toHaveBeenCalledWith('cathedral_echo', 'stone');

    const warnings: string[] = [];
    const failing = new SpatialAudioEngine({
      preferred: 'resonance_3d',
      contextFactory: fakeContextFactory().factory,
      resonanceFactory: async () => {
        throw new Error('sin wasm');
      },
      onWarning: (m) => warnings.push(m),
    });
    await failing.init();
    expect(failing.backendKind).toBe('hrtf_native');
    expect(warnings).toHaveLength(1);
  });

  it('mueve fuentes en vivo y notifica al radar', async () => {
    const { e, ctx } = engine();
    const seen: number[] = [];
    e.subscribe((voices) => seen.push(voices.length));
    await e.play('a.ogg', { id: 'grito', coordinates: { x: 0, y: 0, z: -5 } });
    e.move('grito', { x: -2, y: 0, z: -5 });
    expect(ctx.byKind('panner')[0].positionX.value).toBe(-2);
    expect(e.active[0]?.coordinates).toEqual({ x: -2, y: 0, z: -5 });
    expect(seen).toEqual([0, 1, 1]);
  });

  it('detiene con fundido y libera los recursos al terminar', async () => {
    const { e, ctx } = engine();
    await e.play('a.ogg', { id: 'uno', loop: true });
    await e.play('b.ogg', { id: 'dos' });
    e.stopAll({ loopsOnly: true, fadeMs: 300 });
    expect(e.active.map((v) => v.id)).toEqual(['dos']);
    const second = ctx.byKind('buffer')[1];
    second.end();
    expect(e.active).toEqual([]);
  });

  it('cachea los buffers decodificados', async () => {
    const { e } = engine();
    await e.preload(['a.ogg', 'a.ogg', 'b.ogg']);
    await e.play('a.ogg');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('emite un pop espacial de confirmación', async () => {
    const { e, ctx } = engine();
    await e.confirmationPop({ x: 1, y: 0, z: 1 });
    expect(ctx.byKind('oscillator')[0].type).toBe('triangle');
  });
});

describe('integración con la máquina de estados', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('dispara los eventos declarados según el avance de la lectura', async () => {
    const store = useStoryStore();
    store.load(sampleManifest());
    const { e } = engine();
    e.bind(store);
    store.start();
    await flush();
    expect(e.active.map((v) => v.id)).toEqual(['inicio::gotera']);
    expect(e.currentRoom).toEqual({ preset: 'small_study', material: 'wood' });

    store.setRevealProgress(61);
    await flush();
    expect(e.active.map((v) => v.id)).toContain('inicio::pasos');

    store.advance(); // sale del nodo: los bucles se desvanecen
    await flush();
    expect(e.active.map((v) => v.id)).not.toContain('inicio::gotera');
  });

  it('reproduce el efecto de sonido del desenlace de un enigma', async () => {
    const manifest = sampleManifest();
    const puzzle = manifest.nodes![1]! as { gameplay_overlay: { on_success: Record<string, unknown> } };
    puzzle.gameplay_overlay.on_success.play_sfx = 'assets/audio/door.ogg';
    const store = useStoryStore();
    store.load(manifest);
    const { e } = engine();
    const spy = vi.spyOn(e, 'play');
    e.bind(store);
    store.start();
    store.advance();
    store.resolvePuzzle(true);
    await flush();
    expect(spy).toHaveBeenCalledWith('assets/audio/door.ogg', { gain: 0.9 });
  });

  it('usa el preset de sala del primer evento del nodo', async () => {
    const store = useStoryStore();
    const node = TolerantSchemas.node.parse({
      node_id: 'a',
      acoustic_events: [{ event_id: 'x', asset: 'x.ogg', room_preset: 'cathedral_echo', acoustic_material: 'stone' }],
    });
    store.load({ metadata: { title: 't' }, nodes: [node] });
    const { e } = engine();
    e.bind(store);
    store.start();
    expect(e.currentRoom).toEqual({ preset: 'cathedral_echo', material: 'stone' });
  });
});
