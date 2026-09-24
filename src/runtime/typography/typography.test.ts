import { describe, expect, it } from 'vitest';
import { TolerantSchemas } from '@/core/manifest';
import {
  computeTypographyFrame,
  createFallWorld,
  flickerOpacity,
  heartbeatPulse,
  isWorldAtRest,
  stepFallWorld,
} from './effects';

const engine = (input: Record<string, unknown>) => TolerantSchemas.typographicEngine.parse(input);

describe('heartbeatPulse', () => {
  it('produce dos picos por latido (lub-dub) sincronizados con el BPM', () => {
    const period = 60000 / 60;
    const lub = heartbeatPulse(period * 0.08, 60);
    const dub = heartbeatPulse(period * 0.3, 60);
    const rest = heartbeatPulse(period * 0.7, 60);
    expect(lub).toBeGreaterThan(0.95);
    expect(dub).toBeGreaterThan(0.5);
    expect(dub).toBeLessThan(lub);
    expect(rest).toBeLessThan(0.01);
    // periodicidad
    expect(heartbeatPulse(period * 0.08 + period * 3, 60)).toBeCloseTo(lub, 5);
  });
});

describe('flickerOpacity', () => {
  it('se mantiene en un rango legible', () => {
    for (let t = 0; t < 10000; t += 37) {
      const o = flickerOpacity(t);
      expect(o).toBeGreaterThanOrEqual(0.55);
      expect(o).toBeLessThanOrEqual(1);
    }
  });
});

describe('computeTypographyFrame', () => {
  it('usa una columna serena sin directivas', () => {
    const frame = computeTypographyFrame(undefined, 0);
    expect(frame.style['--dv-column-width']).toBe('38rem');
    expect(frame.layers).toEqual({ melt: false, flashlight: false, physics: false });
  });

  it('comprime la columna en el pasillo angosto', () => {
    const frame = computeTypographyFrame(engine({ layout_mode: 'narrow_corridor', column_width_rem: 24, transition_speed_ms: 800 }), 0);
    expect(frame.style['--dv-column-width']).toBe('24rem');
    expect(frame.style['--dv-transition-ms']).toBe('800ms');
    expect(frame.classes).toContain('dv-layout-narrow-corridor');
  });

  it('usa 24rem por defecto en el pasillo angosto', () => {
    expect(computeTypographyFrame(engine({ layout_mode: 'narrow_corridor' }), 0).style['--dv-column-width']).toBe('24rem');
  });

  it('escala el texto al ritmo del corazón', () => {
    const e = engine({ heartbeat_sync: { enabled: true, bpm: 60, text_scale_amplitude: 0.1 } });
    const peak = computeTypographyFrame(e, 80);
    expect(peak.style.transform).toMatch(/scale\(1\.(09|10)\d+\)/);
    expect(peak.classes).toContain('dv-heartbeat');
  });

  it('desactiva el movimiento si el lector lo pide', () => {
    const e = engine({ heartbeat_sync: { enabled: true, bpm: 60 }, flicker_effect: true });
    const frame = computeTypographyFrame(e, 80, { reducedMotion: true });
    expect(frame.style.transform).toBeUndefined();
    expect(frame.style.opacity).toBe('0.9');
  });

  it('invierte el texto como un espejo', () => {
    expect(computeTypographyFrame(engine({ layout_mode: 'mirror_inverted' }), 0).style.transform).toBe('scaleX(-1)');
    expect(computeTypographyFrame(engine({ layout_mode: 'mirror_inverted', mirror: { axis: 'y' } }), 0).style.transform).toBe('scaleY(-1)');
  });

  it('activa las capas especiales', () => {
    expect(computeTypographyFrame(engine({ layout_mode: 'melt_text' }), 0).layers.melt).toBe(true);
    expect(computeTypographyFrame(engine({ layout_mode: 'flashlight_mask' }), 0).layers.flashlight).toBe(true);
    expect(computeTypographyFrame(engine({ flashlight_reveal: { radius_px: 100 } }), 0).layers.flashlight).toBe(true);
    expect(computeTypographyFrame(engine({ layout_mode: 'physics_fall' }), 0).layers.physics).toBe(true);
  });
});

describe('física textual', () => {
  it('las palabras caen, rebotan y reposan en el suelo', () => {
    let world = createFallWorld(8, 200, 9.8, 0.4);
    let bounced = false;
    for (let i = 0; i < 60 * 20 && !isWorldAtRest(world); i++) {
      world = stepFallWorld(world, 1 / 60);
      if (world.bodies.some((b) => b.vy < 0 && b.y > 150)) bounced = true;
    }
    expect(bounced).toBe(true);
    expect(isWorldAtRest(world)).toBe(true);
    for (const body of world.bodies) expect(body.y).toBe(200);
  });

  it('sin rebote se detienen al primer contacto', () => {
    let world = createFallWorld(1, 100, 9.8, 0);
    for (let i = 0; i < 600 && !isWorldAtRest(world); i++) world = stepFallWorld(world, 1 / 60);
    expect(world.bodies[0]!.resting).toBe(true);
  });
});
