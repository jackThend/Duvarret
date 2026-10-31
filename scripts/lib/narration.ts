/** Generación local e incremental, con el mismo plan que Studio. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { AssetRegistry } from '../../src/core/assets/registry';
import { checkIntegrity, validateManifestText } from '../../src/core/manifest';
import { applyNarration, planNarration, type Delivery } from '../../src/core/narration/plan';
import { loadProject, REPO_ROOT } from './projectFs';

export async function narrateProject(input: string, options: { python?: string; models?: string; runtime?: string; delivery?: Delivery } = {}) {
  const root = resolve(input);
  const { manifest, pristine } = validateManifestText(loadProject(root).manifestText);
  if (!pristine) throw new Error('Corrige el formato del manifiesto antes de generar la voz.');
  const plan = await planNarration(manifest, path => existsSync(join(root, path)), options.delivery);
  if (plan.provider && plan.provider !== 'kokoro') throw new Error('Esta obra usa una voz de un servicio externo. Actualízala desde Studio con la conexión del proveedor; la CLI local solo genera Kokoro.');
  const models = options.models ?? process.env.DUVARRET_KOKORO_MODELS ?? join(REPO_ROOT, '.cache/voz/modelos');
  const runtime = options.runtime ?? process.env.DUVARRET_KOKORO_RUNTIME ?? join(REPO_ROOT, '.cache/voz/runtime');
  const python = options.python ?? process.env.DUVARRET_PYTHON ?? 'python';
  if (plan.pending.length) {
    const file = join(mkdtempSync(join(tmpdir(), 'duvarret-narracion-')), 'plan.json');
    writeFileSync(file, JSON.stringify({ root, models, runtime, voice: plan.voice, delivery: plan.delivery, speed: plan.speed, clips: plan.pending }));
    console.log(`Generando ${plan.pending.length} frases con ${plan.label}, en este equipo…`);
    execFileSync(python, [join(REPO_ROOT, 'scripts/synthesize-narration.py'), '--plan', file], { stdio: 'inherit', windowsHide: true });
  }
  const registryPath = join(root, 'assets/registry.json');
  const registry = existsSync(registryPath) ? AssetRegistry.fromJson(readFileSync(registryPath, 'utf8')) : new AssetRegistry();
  for (const clip of plan.clips) {
    const data = readFileSync(join(root, clip.asset));
    if (data.length < 100 || data.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`Grabación incompleta: ${clip.asset}`);
    registry.register({ path: clip.asset, origin: 'synthetic', provider: `Kokoro-82M · ONNX local · ${plan.voice} · ${plan.delivery} · ${plan.speed}`, license: 'Modelo Kokoro: Apache-2.0', bytes: data.length });
  }
  const next = applyNarration(manifest, plan);
  const errors = checkIntegrity(next).filter(issue => issue.severity === 'error');
  if (errors.length) throw new Error(errors.map(issue => issue.message).join('\n'));
  mkdirSync(join(root, 'manifest'), { recursive: true });
  writeFileSync(join(root, 'manifest/story_manifest.json'), JSON.stringify(next, null, 2));
  writeFileSync(registryPath, JSON.stringify(registry.toJSON(), null, 2));
  console.log(`✓ ${plan.clips.length} intervenciones con la misma voz; ${plan.pending.length} nuevas. Manifiesto validado.`);
}
