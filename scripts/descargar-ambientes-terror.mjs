/** Grabaciones reales CC0 de Joseph SARDIN. Sin claves, cuenta ni proveedor de pago. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(process.argv[2] ?? 'terminados/la-casa-que-aprendio-mi-nombre/obra.duvarret');
const dir = join(root, 'assets/audio/banco');
mkdirSync(dir, { recursive: true });
const sources = [
  ['lluvia-charcos-1290.wav', 'https://lasonotheque.org/UPLOAD/bwf-fr/1290.wav', 'https://lasonotheque.org/pluie-sur-flaques-d-eau-s1290.html'],
  ['mar-costero-0698.wav', 'https://bigsoundbank.com/UPLOAD/bwf-en/0698.wav', 'https://bigsoundbank.com/sea-waves-s0698.html'],
  ['viento-real-0146.wav', 'https://bigsoundbank.com/UPLOAD/bwf-en/0146.wav', 'https://bigsoundbank.com/strong-wind-1-s0146.html'],
  ['puerta-crujido-1159.wav', 'https://bigsoundbank.com/UPLOAD/bwf-en/1159.wav', 'https://bigsoundbank.com/door-squeaks-and-rubs-1-s1159.html'],
];
const credits = ['# Grabaciones reales del cuento', '', 'Autor: Joseph SARDIN. Licencia seleccionada: CC0 1.0 Universal.', 'Licencia oficial: https://bigsoundbank.com/licenses.html', 'Dedicación: https://creativecommons.org/publicdomain/zero/1.0/', 'Originales sin modificar; atribución voluntaria. No sugieren respaldo del autor.', 'El mar es una grabación del Atlántico francés y el viento incluye un ave.', ''];
for (const [name, url, page] of sources) {
  const path = join(dir, name);
  if (!existsSync(path)) {
    const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 50 * 1024 * 1024 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${name}: descarga no válida`);
    writeFileSync(path, bytes, { flag: 'wx' });
  }
  const bytes = readFileSync(path);
  credits.push(`- ${name}: ${page}`, `  - Original: ${url}`, `  - SHA-256: ${createHash('sha256').update(bytes).digest('hex')}`);
  console.log(`${name}: ${bytes.length} bytes`);
}
const creditPath = join(dir, 'FUENTES-DESCARGA.md');
if (!existsSync(creditPath)) writeFileSync(creditPath, credits.join('\n'), { flag: 'wx' });
