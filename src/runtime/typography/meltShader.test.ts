import { describe, expect, it, vi } from 'vitest';
import { createMeltRenderer, meltProgress, MELT_FRAGMENT_SHADER } from './meltShader';

/** Contexto WebGL simulado que registra las llamadas. */
function fakeGl(options: { compileOk?: boolean } = {}) {
  const calls: string[] = [];
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (/^[A-Z_]+$/.test(prop)) return prop;
      return (...args: unknown[]) => {
        calls.push(prop);
        if (prop === 'getShaderParameter') return options.compileOk ?? true;
        if (prop === 'getProgramParameter') return true;
        if (prop === 'getShaderInfoLog') return 'error de sintaxis';
        if (prop.startsWith('create')) return { kind: prop };
        if (prop === 'getAttribLocation') return 0;
        if (prop === 'getUniformLocation') return { name: args[1] };
        return undefined;
      };
    },
  };
  return { gl: new Proxy({}, handler), calls };
}

function canvasWith(gl: unknown) {
  const canvas = document.createElement('canvas');
  canvas.getContext = vi.fn(() => gl) as unknown as HTMLCanvasElement['getContext'];
  return canvas;
}

describe('melt shader', () => {
  it('el progreso es suave y acotado', () => {
    expect(meltProgress(0, 1000)).toBe(0);
    expect(meltProgress(500, 1000)).toBeCloseTo(0.5);
    expect(meltProgress(5000, 1000)).toBe(1);
    expect(meltProgress(-5, 1000)).toBe(0);
  });

  it('el fragment shader declara los uniforms que usa el runtime', () => {
    for (const u of ['u_text', 'u_progress', 'u_intensity', 'u_direction', 'u_time']) expect(MELT_FRAGMENT_SHADER).toContain(u);
  });

  it('compila, enlaza y dibuja con WebGL', () => {
    const { gl, calls } = fakeGl();
    const renderer = createMeltRenderer(canvasWith(gl));
    expect(renderer).not.toBeNull();
    renderer!.render({ progress: 0.5, intensity: 0.8, direction: 1, time: 100 });
    expect(calls).toContain('compileShader');
    expect(calls).toContain('linkProgram');
    expect(calls.filter((c) => c === 'uniform1f')).toHaveLength(4);
    expect(calls).toContain('drawArrays');
    renderer!.dispose();
    expect(calls).toContain('deleteProgram');
  });

  it('devuelve null (fallback CSS) si no hay WebGL o el shader falla', () => {
    expect(createMeltRenderer(canvasWith(null))).toBeNull();
    expect(createMeltRenderer(canvasWith(fakeGl({ compileOk: false }).gl))).toBeNull();
  });
});
