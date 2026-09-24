/**
 * Shader WebGL de licuado (melt_text): un mapa de desplazamiento vertical que hace
 * "derretirse" la textura del texto columna a columna.
 */

export const MELT_VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export const MELT_FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_text;
uniform float u_progress;
uniform float u_intensity;
uniform float u_direction;
uniform float u_time;
varying vec2 v_uv;

float hash(float n) { return fract(sin(n) * 43758.5453123); }

void main() {
  float column = floor(v_uv.x * 160.0);
  float speed = 0.35 + hash(column) * 0.65;
  float drip = u_progress * u_intensity * speed * 0.6;
  float wobble = sin(v_uv.y * 18.0 + u_time * 0.002 + column) * 0.004 * u_intensity * u_progress;
  vec2 uv = vec2(v_uv.x + wobble, v_uv.y - drip * u_direction);
  vec4 color = texture2D(u_text, uv);
  float fade = 1.0 - smoothstep(0.7, 1.0, u_progress * speed);
  gl_FragColor = vec4(color.rgb, color.a * fade);
}`;

export interface MeltUniforms {
  progress: number;
  intensity: number;
  direction: 1 | -1;
  time: number;
}

/** Progreso [0,1] con aceleración suave (el calor avanza lento y luego se desborda). */
export function meltProgress(elapsedMs: number, durationMs: number): number {
  const x = Math.max(0, Math.min(1, elapsedMs / Math.max(1, durationMs)));
  return x * x * (3 - 2 * x);
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log ?? 'shader');
  }
  return shader;
}

export interface MeltRenderer {
  setTexture(source: TexImageSource): void;
  render(uniforms: MeltUniforms): void;
  dispose(): void;
}

/** Crea el renderizador; devuelve `null` si el dispositivo no ofrece WebGL (se usa el fallback CSS). */
export function createMeltRenderer(canvas: HTMLCanvasElement): MeltRenderer | null {
  let gl: WebGLRenderingContext | null;
  try {
    gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true }) as WebGLRenderingContext | null;
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const ctx = gl;

  try {
    const program = ctx.createProgram();
    if (!program) return null;
    ctx.attachShader(program, compile(ctx, ctx.VERTEX_SHADER, MELT_VERTEX_SHADER));
    ctx.attachShader(program, compile(ctx, ctx.FRAGMENT_SHADER, MELT_FRAGMENT_SHADER));
    ctx.linkProgram(program);
    if (!ctx.getProgramParameter(program, ctx.LINK_STATUS)) return null;
    ctx.useProgram(program);

    const buffer = ctx.createBuffer();
    ctx.bindBuffer(ctx.ARRAY_BUFFER, buffer);
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), ctx.STATIC_DRAW);
    const position = ctx.getAttribLocation(program, 'a_position');
    ctx.enableVertexAttribArray(position);
    ctx.vertexAttribPointer(position, 2, ctx.FLOAT, false, 0, 0);

    const texture = ctx.createTexture();
    ctx.bindTexture(ctx.TEXTURE_2D, texture);
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR);

    const u = {
      progress: ctx.getUniformLocation(program, 'u_progress'),
      intensity: ctx.getUniformLocation(program, 'u_intensity'),
      direction: ctx.getUniformLocation(program, 'u_direction'),
      time: ctx.getUniformLocation(program, 'u_time'),
    };

    return {
      setTexture(source) {
        ctx.bindTexture(ctx.TEXTURE_2D, texture);
        ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, ctx.RGBA, ctx.UNSIGNED_BYTE, source);
      },
      render({ progress, intensity, direction, time }) {
        ctx.viewport(0, 0, canvas.width, canvas.height);
        ctx.clearColor(0, 0, 0, 0);
        ctx.clear(ctx.COLOR_BUFFER_BIT);
        ctx.uniform1f(u.progress, progress);
        ctx.uniform1f(u.intensity, intensity);
        ctx.uniform1f(u.direction, direction);
        ctx.uniform1f(u.time, time);
        ctx.drawArrays(ctx.TRIANGLES, 0, 6);
      },
      dispose() {
        ctx.deleteTexture(texture);
        ctx.deleteBuffer(buffer);
        ctx.deleteProgram(program);
      },
    };
  } catch {
    return null;
  }
}

/** Rasteriza el texto en un canvas 2D para usarlo como textura del shader. */
export function rasterizeText(
  text: string,
  width: number,
  options: { font: string; color: string; lineHeight: number },
): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = options.font;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > width && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(lines.length * options.lineHeight + options.lineHeight));
  ctx.font = options.font;
  ctx.fillStyle = options.color;
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, 0, i * options.lineHeight));
  return canvas;
}
