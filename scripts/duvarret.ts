#!/usr/bin/env tsx
/**
 * CLI de Duvarret: valida, importa y exporta obras `.duvarret`.
 *
 *   npm run duvarret -- validate <proyecto>
 *   npm run duvarret -- export <proyecto> --target web|audio|native|portable|all [--out <dir>] [--zip] [--player <binario>]
 *   npm run duvarret -- ingest <manuscrito.txt|md|pdf|docx|epub> --out <proyecto> [--title "Título"]
 *   npm run duvarret -- probar-ia <proyecto> --proveedor anthropic|ollama|openai|gemini|local [--modelo m] [--url base] [--escena id]
 *
 * `probar-ia` hace una vuelta real del co-director sobre una copia de la obra (no la modifica). Las
 * claves se leen del entorno: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { compileBundle, workSlug, zipBundle, TARGET_LABELS, type CompileResult, type ExportTarget } from '../src/core/compiler';
import { checkIntegrity, validateManifestText } from '../src/core/manifest';
import { readManuscript } from '../src/core/ingest/readers';
import { parseManuscript } from '../src/core/ingest/sceneParser';
import { createMeta, manifestFromManuscript, PROJECT_PATHS } from '../src/core/project';
import { createProvider, PROVIDER_LABELS, probeProvider, type ProviderKind } from '../src/core/agent';
import { ensurePlayerRuntime, ffmpegOptimizer, loadProject, REPO_ROOT, runLocalCli, writeTree } from './lib/projectFs';

const MB = 1024 * 1024;
const fmt = (bytes: number) => (bytes >= MB ? `${(bytes / MB).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`);
const log = (...args: unknown[]) => console.log(...args);

function report(result: CompileResult) {
  for (const issue of result.blocking) log(`  ✗ ${issue.message}`);
  for (const issue of result.warnings.slice(0, 10)) log(`  · ${issue.message}`);
  if (result.missingAssets.length) log(`  · ${result.missingAssets.length} recursos pendientes (sonarán como tono de prueba): ${result.missingAssets.join(', ')}`);
}

async function build(projectDir: string, target: ExportTarget) {
  const project = loadProject(projectDir);
  const optimize = ffmpegOptimizer();
  return compileBundle(
    { manifest: JSON.parse(project.manifestText) as unknown, readAsset: project.readAsset, runtime: ensurePlayerRuntime(), ...(optimize ? { optimize } : {}) },
    target,
  );
}

function binaryName(slug: string) {
  return process.platform === 'win32' ? `${slug}.exe` : slug;
}

/** Compila el reproductor nativo con Tauri (LTO, perfil ligero). `frontendDist` = carpeta del runtime. */
function tauriBuild(frontendDist: string, productName: string, identifier: string): string {
  const override = JSON.stringify({
    productName,
    identifier,
    build: { frontendDist, beforeBuildCommand: '', beforeDevCommand: '' },
    bundle: { active: false },
  });
  runLocalCli('tauri', ['build', '--no-bundle', '--config', 'src-tauri/tauri.player.conf.json', '--config', override]);
  const exe = join(REPO_ROOT, 'src-tauri/target/release', process.platform === 'win32' ? 'duvarret.exe' : 'duvarret');
  if (!existsSync(exe)) throw new Error('No se generó el binario nativo.');
  return exe;
}

async function exportTarget(projectDir: string, target: string, outRoot: string, zip: boolean, player?: string) {
  const compileTarget: ExportTarget = target === 'audio' ? 'audio_drama' : target === 'native' || target === 'portable' ? 'native' : 'web';
  log(`\n▶ ${TARGET_LABELS[compileTarget]}${target === 'portable' ? ' (portátil)' : ''}`);
  const result = await build(projectDir, compileTarget);
  report(result);
  if (!result.ok) {
    process.exitCode = 1;
    return;
  }
  const slug = workSlug(result.manifest);
  const outDir = join(outRoot, target);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  if (target === 'native') {
    const stage = join(outRoot, '.native-stage');
    rmSync(stage, { recursive: true, force: true });
    writeTree(stage, result.files);
    const exe = tauriBuild(stage, result.manifest.metadata.title, `engine.duvarret.obra.${slug.replace(/-/g, '')}`);
    const dest = join(outDir, binaryName(slug));
    copyFileSync(exe, dest);
    chmodSync(dest, 0o755);
    rmSync(stage, { recursive: true, force: true });
    const size = statSync(dest).size;
    log(`  ✓ ${dest} (${fmt(size)}${size < 20 * MB ? ', < 20 MB' : ', ¡supera 20 MB!'})`);
    return;
  }

  if (target === 'portable') {
    // Binario genérico + carpeta obra/ servida por el protocolo obra://
    const exe = player ?? tauriBuild(join(REPO_ROOT, 'dist-player'), 'Duvarret Player', 'engine.duvarret.player');
    const dest = join(outDir, binaryName(slug));
    copyFileSync(exe, dest);
    chmodSync(dest, 0o755);
    const obra = new Map([...result.files].filter(([p]) => p.startsWith('manifest/') || p.startsWith('assets/')));
    writeTree(join(outDir, 'obra'), obra);
    log(`  ✓ ${dest} + obra/ (${fmt(statSync(dest).size)} + ${fmt(result.stats.assetBytes)})`);
  } else {
    writeTree(outDir, result.files);
    log(`  ✓ ${outDir} (${result.stats.files} archivos, ${fmt(result.stats.bytes)})`);
  }
  if (zip) {
    const zipPath = join(outRoot, `${slug}-${target}.zip`);
    writeFileSync(zipPath, zipBundle(result.files, slug));
    log(`  ✓ ${zipPath} (${fmt(statSync(zipPath).size)})`);
  }
}

const KEY_VARS: Partial<Record<ProviderKind, string>> = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' };

async function probeAi(projectDir: string, values: { proveedor?: string; modelo?: string; url?: string; escena?: string }) {
  const kind = values.proveedor as ProviderKind;
  if (!(kind in PROVIDER_LABELS)) throw new Error(`Proveedor desconocido: ${values.proveedor}. Opciones: ${Object.keys(PROVIDER_LABELS).join(', ')}`);
  const keyVar = KEY_VARS[kind];
  const apiKey = keyVar ? process.env[keyVar] : undefined;
  // Claude también admite ANTHROPIC_AUTH_TOKEN o un perfil de `ant auth login`: el SDK los resuelve solo.
  if (keyVar && !apiKey && kind !== 'anthropic') throw new Error(`Define ${keyVar} con tu clave para probar ${PROVIDER_LABELS[kind]}.`);
  const provider = createProvider({ kind, ...(values.modelo ? { model: values.modelo } : {}), ...(apiKey ? { apiKey } : {}), ...(values.url ? { baseUrl: values.url } : {}) });
  const { manifest } = validateManifestText(loadProject(projectDir).manifestText);
  log(`▶ ${PROVIDER_LABELS[kind]} · ${provider.model}`);
  const report = await probeProvider(provider, manifest, values.escena ? { nodeId: values.escena } : {});
  for (const check of report.checks) log(`  ${check.ok ? '✓' : '✗'} ${check.label}${check.detail ? ` — ${check.detail}` : ''}`);
  log(`  · ${report.steps} pasos, ${(report.latencyMs / 1000).toFixed(1)} s, herramientas: ${report.tools.join(', ') || 'ninguna'}`);
  if (report.reply) log(`  · Respuesta: ${report.reply.slice(0, 300)}`);
  log(report.ok ? '\n✓ El co-director funciona con este proveedor.' : '\n✗ El proveedor no superó la prueba.');
  process.exitCode = report.ok ? 0 : 1;
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      target: { type: 'string', default: 'web' },
      out: { type: 'string' },
      zip: { type: 'boolean', default: false },
      title: { type: 'string' },
      player: { type: 'string' },
      proveedor: { type: 'string', default: 'local' },
      modelo: { type: 'string' },
      url: { type: 'string' },
      escena: { type: 'string' },
    },
  });
  const [command, input] = positionals;

  if (command === 'validate' && input) {
    const project = loadProject(input);
    const { manifest, issues } = validateManifestText(project.manifestText);
    const integrity = checkIntegrity(manifest);
    for (const i of [...issues, ...integrity]) log(`${i.severity === 'error' ? '✗' : i.severity === 'warning' ? '·' : ' '} ${i.message}${i.path ? ` [${i.path}]` : ''}`);
    const errors = integrity.filter((i) => i.severity === 'error').length;
    log(`\n${manifest.metadata.title}: ${manifest.nodes.length} escenas, ${errors} errores.`);
    process.exitCode = errors ? 1 : 0;
    return;
  }

  if (command === 'export' && input) {
    const outRoot = resolve(values.out ?? join(input, PROJECT_PATHS.export));
    const targets = values.target === 'all' ? ['web', 'audio', 'native'] : [values.target!];
    for (const target of targets) await exportTarget(input, target, outRoot, values.zip!, values.player);
    return;
  }

  if (command === 'ingest' && input && values.out) {
    const text = await readManuscript(basename(input), new Uint8Array(readFileSync(input)));
    const parsed = parseManuscript(text, { title: basename(input).replace(/\.[^.]+$/, '') });
    const title = values.title ?? parsed.title;
    const root = resolve(values.out);
    for (const dir of ['manuscript/raw', 'manuscript/beats', 'knowledge', 'manifest', 'assets/audio', 'assets/images', 'export']) mkdirSync(join(root, dir), { recursive: true });
    copyFileSync(input, join(root, 'manuscript/raw', basename(input)));
    for (const beat of parsed.beats) writeFileSync(join(root, 'manuscript/beats', `${beat.id}.md`), beat.text);
    writeFileSync(join(root, PROJECT_PATHS.manifest), JSON.stringify(manifestFromManuscript(parsed, { title, author: '' }), null, 2));
    writeFileSync(join(root, PROJECT_PATHS.meta), JSON.stringify(createMeta({ title, mode: 'exegesis' }), null, 2));
    log(`✓ ${root}: ${parsed.chapters.length} capítulos, ${parsed.beats.length} escenas, ${parsed.totalWords} palabras.`);
    return;
  }

  if (command === 'probar-ia' && input) {
    await probeAi(input, values);
    return;
  }

  log('Uso:\n  duvarret validate <proyecto>\n  duvarret export <proyecto> --target web|audio|native|portable|all [--out dir] [--zip]\n  duvarret ingest <manuscrito> --out <proyecto> [--title "…"]\n  duvarret probar-ia <proyecto> --proveedor anthropic|ollama|openai|gemini|local [--modelo m] [--url base] [--escena id]');
  process.exitCode = 2;
}

void main().catch((error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
