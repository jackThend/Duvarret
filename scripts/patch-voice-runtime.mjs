/** Parche reproducible de phonemizer 3.4.0: eSpeak Windows necesita datos relativos ASCII. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function patchVoiceRuntime(runtime) {
  const file = join(runtime, 'phonemizer/backend/espeak/api.py');
  const original = readFileSync(file);
  const expected = 'e0fb8775e9b1a35d030686954b860f1ec7367d42ea82939df026e67d144d3bf8';
  if (createHash('sha256').update(original).digest('hex') !== expected) {
    throw new Error('phonemizer api.py cambió: revisar el parche Windows antes de distribuir.');
  }
  const source = original.toString('utf8').replaceAll('\r\n', '\n');
  const patched = source.replace('import pathlib\n', 'import pathlib\nimport os\n').replace(
    "            data_path = str(data_path).encode('utf-8')",
    "            # Duvarret 2026-10-21: Windows eSpeak abre datos con fopen ANSI.\n" +
    "            # El sintetizador fija cwd al cargador incluido; la ruta es ASCII relativa.\n" +
    "            if sys.platform == 'win32':\n" +
    "                data_path = os.path.relpath(data_path)\n" +
    "            data_path = str(data_path).encode('utf-8')",
  );
  if (patched === source || !patched.includes('import os\n')) throw new Error('No se pudo aplicar el parche de phonemizer.');
  writeFileSync(file, patched, 'utf8');
}
