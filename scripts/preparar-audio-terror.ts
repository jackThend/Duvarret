/** Foley y música originales, sin servicio remoto ni cuota. Las grabaciones de campo se acreditan aparte. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { synthesizeAll } from './synthesize-foley';
import { encodeWav } from '../src/core/assets/wav';
import { validateGeneratedMedia } from '../src/core/ai/media';
import { AssetRegistry } from '../src/core/assets/registry';

const root = resolve(process.argv[2] ?? 'terminados/la-casa-que-aprendio-mi-nombre/obra.duvarret');
const dir = join(root, 'assets/audio');
mkdirSync(dir, { recursive: true });
const written = synthesizeAll(dir);
const rate = 24000;
const music = new Float32Array(rate * 32);
// «El compás que sobra»: órgano de cuatro notas, tres pulsos contra un cuarto que llega tarde.
const notes = [55, 65.406, 77.782, 58.27];
for (let i = 0; i < music.length; i++) {
  const t = i / rate;
  const section = Math.min(3, Math.floor(t / 8));
  const f = notes[section]!;
  const pulse = .65 + .35 * Math.sin(2 * Math.PI * t / 3.7);
  const envelope = Math.min(1, t / 3, (32 - t) / 3);
  music[i] = envelope * pulse * (.18 * Math.sin(2 * Math.PI * f * t) + .07 * Math.sin(2 * Math.PI * (f * 1.498) * t) + .035 * Math.sin(2 * Math.PI * (f * 2 + .7) * t));
}
let seed = 1447;
const shot = new Float32Array(rate * 2);
for (let i = 0; i < shot.length; i++) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const t = i / rate;
  const noise = seed / 2 ** 31 - 1;
  shot[i] = .7 * noise * Math.exp(-t * 36) + .2 * Math.sin(2 * Math.PI * 62 * t) * Math.exp(-t * 9);
}
const footsteps = new Float32Array(rate * 7);
for (let step = 0; step < 10; step++) {
  const start = Math.round((.15 + step * .65) * rate);
  for (let frame = 0; frame < rate * .35 && start + frame < footsteps.length; frame++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const t = frame / rate;
    const noise = seed / 2 ** 31 - 1;
    footsteps[start + frame]! += .3 * Math.sin(2 * Math.PI * (85 + step % 2 * 12) * t) * Math.exp(-t * 25) + .13 * noise * Math.exp(-t * 80);
  }
}
for (const [name, samples] of [['music', music], ['gunshot', shot], ['footsteps', footsteps]] as const) {
  const data = encodeWav(samples, rate);
  validateGeneratedMedia(data, 'audio/wav');
  writeFileSync(join(dir, `${name}.wav`), data);
  written[name] = data.byteLength;
}
const registryPath = join(root, 'assets/registry.json');
const registry = existsSync(registryPath) ? AssetRegistry.fromJson(readFileSync(registryPath, 'utf8')) : new AssetRegistry();
for (const [name, bytes] of Object.entries(written)) registry.register({ path: `assets/audio/${name}.wav`, title: name === 'music' ? 'El compás que sobra · música original' : `Foley original: ${name}`, bytes, origin: 'synthetic', provider: 'Síntesis procedural local', author: 'Duvarret', license: 'CC0-1.0', prompt: 'Recursos originales para La casa que aprendió mi nombre' });
writeFileSync(registryPath, JSON.stringify(registry.toJSON(), null, 2));
console.log(`Preparados ${Object.keys(written).length} sonidos originales en ${dir}`);
