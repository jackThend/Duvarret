/**
 * Motor tipográfico ergódico: funciones puras que traducen las directivas declarativas del
 * manifiesto en estilos. Son deterministas en función del tiempo `t` (ms), lo que permite
 * probarlas sin navegador y reproducir la misma experiencia en cualquier plataforma.
 */
import type { TypographicEngine } from '@/core/manifest';

export const DEFAULT_COLUMN_REM = 38;

export interface TypographyFrame {
  /** Variables CSS y propiedades a aplicar al contenedor del texto. */
  style: Record<string, string>;
  /** Clases semánticas para el contenedor. */
  classes: string[];
  /** Capas especiales que el componente debe montar. */
  layers: { melt: boolean; flashlight: boolean; physics: boolean };
}

/**
 * Pulso cardíaco "lub-dub": dos picos gaussianos por latido.
 * Devuelve un valor en [0, 1].
 */
export function heartbeatPulse(tMs: number, bpm: number): number {
  const period = 60000 / Math.max(1, bpm);
  const phase = (((tMs % period) + period) % period) / period;
  const peak = (center: number, width: number, height: number) =>
    height * Math.exp(-((phase - center) ** 2) / (2 * width ** 2));
  return Math.min(1, peak(0.08, 0.035, 1) + peak(0.3, 0.04, 0.6));
}

/** Parpadeo irregular pero determinista (como una consola o una vela), en [0.55, 1]. */
export function flickerOpacity(tMs: number): number {
  const s = Math.sin(tMs * 0.013) * Math.sin(tMs * 0.0071 + 1.3) * Math.sin(tMs * 0.031 + 0.4);
  const dip = s > 0.55 ? (s - 0.55) * 2 : 0;
  return Math.max(0.55, 1 - dip - 0.04 * Math.abs(Math.sin(tMs * 0.05)));
}

export interface FrameOptions {
  reducedMotion?: boolean;
}

export function computeTypographyFrame(
  engine: TypographicEngine | undefined,
  tMs: number,
  options: FrameOptions = {},
): TypographyFrame {
  const style: Record<string, string> = {};
  const classes: string[] = ['dv-ergodic'];
  const layers = { melt: false, flashlight: false, physics: false };
  if (!engine) {
    style['--dv-column-width'] = `${DEFAULT_COLUMN_REM}rem`;
    return { style, classes, layers };
  }

  const motion = !options.reducedMotion;
  const mode = engine.layout_mode;
  classes.push(`dv-layout-${mode.replace(/_/g, '-')}`);

  const width = engine.column_width_rem ?? (mode === 'narrow_corridor' ? 24 : DEFAULT_COLUMN_REM);
  style['--dv-column-width'] = `${width}rem`;
  style['--dv-transition-ms'] = `${engine.transition_speed_ms}ms`;

  const transforms: string[] = [];

  const heartbeat = engine.heartbeat_sync;
  const heartbeatOn = heartbeat?.enabled ?? mode === 'heartbeat_tremor';
  if (heartbeatOn && motion) {
    const bpm = heartbeat?.bpm ?? 72;
    const amplitude = heartbeat?.text_scale_amplitude ?? 0.02;
    const pulse = heartbeatPulse(tMs, bpm);
    transforms.push(`scale(${(1 + amplitude * pulse).toFixed(4)})`);
    // Temblor lateral mínimo sincronizado con el pulso.
    const jitter = pulse * amplitude * 40 * Math.sin(tMs * 0.09);
    transforms.push(`translateX(${jitter.toFixed(2)}px)`);
    style['--dv-pulse'] = pulse.toFixed(3);
    classes.push('dv-heartbeat');
  }

  if (engine.flicker_effect) {
    style.opacity = motion ? flickerOpacity(tMs).toFixed(3) : '0.9';
    classes.push('dv-flicker');
  }

  if (mode === 'mirror_inverted' || engine.mirror) {
    const axis = engine.mirror?.axis ?? 'x';
    transforms.push(axis === 'x' ? 'scaleX(-1)' : 'scaleY(-1)');
    classes.push(`dv-mirror-${axis}`);
  }

  if (transforms.length) style.transform = transforms.join(' ');

  layers.melt = mode === 'melt_text' || !!engine.melt?.enabled;
  layers.flashlight = mode === 'flashlight_mask' || !!engine.flashlight_reveal?.enabled;
  layers.physics = mode === 'physics_fall' || !!engine.physics?.enabled;

  return { style, classes, layers };
}

// ── Física textual: las palabras caen y rebotan (physics_fall) ─────────────

export interface Body {
  y: number;
  vy: number;
  x: number;
  rotation: number;
  resting: boolean;
}

export interface FallWorld {
  bodies: Body[];
  floor: number;
  gravity: number;
  bounce: number;
}

/** Crea el mundo físico con un retardo de caída escalonado por palabra. */
export function createFallWorld(count: number, floor: number, gravity = 9.8, bounce = 0.4): FallWorld {
  return {
    bodies: Array.from({ length: count }, (_, i) => ({ y: 0, vy: -((i * 37) % 11) * 0.8, x: 0, rotation: 0, resting: false })),
    floor,
    gravity,
    bounce,
  };
}

/** Avanza la simulación `dt` segundos (integración semi-implícita de Euler). */
export function stepFallWorld(world: FallWorld, dt: number): FallWorld {
  const pxPerMeter = 60;
  const bodies = world.bodies.map((body, i) => {
    if (body.resting) return body;
    let vy = body.vy + world.gravity * pxPerMeter * dt;
    let y = body.y + vy * dt;
    let resting = false;
    if (y >= world.floor) {
      y = world.floor;
      vy = -vy * world.bounce;
      if (Math.abs(vy) < 20) {
        vy = 0;
        resting = true;
      }
    }
    const drift = Math.sin(i * 12.9898) * 12;
    return { y, vy, x: body.x + drift * dt, rotation: body.rotation + drift * dt * 2, resting };
  });
  return { ...world, bodies };
}

export function isWorldAtRest(world: FallWorld): boolean {
  return world.bodies.every((b) => b.resting);
}
