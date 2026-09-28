/**
 * Firma de código de los ejecutables exportados, si el entorno trae los certificados. Sin ellos
 * no se firma (y se dice): Windows mostrará SmartScreen y macOS pedirá abrirlo con clic derecho.
 *
 *   Windows: DUVARRET_WIN_CERT (ruta al .pfx) y DUVARRET_WIN_CERT_PASSWORD; opcional DUVARRET_SIGNTOOL.
 *   macOS:   DUVARRET_MAC_IDENTITY («Developer ID Application: …», ya en el llavero). Para notarizar,
 *            además APPLE_ID, APPLE_TEAM_ID y APPLE_PASSWORD (contraseña específica de app).
 *   Opcional en ambos: DUVARRET_TIMESTAMP_URL (sello de tiempo; por defecto el de DigiCert en Windows).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export interface SignStep {
  label: string;
  command: string;
  args: string[];
  /** Valores que no deben aparecer en el registro. */
  secrets?: string[];
}

export type SigningPlan = { steps: SignStep[]; cleanup?: string[] } | { skipped: string };

type Env = Record<string, string | undefined>;

const DEFAULT_TIMESTAMP = 'http://timestamp.digicert.com';

export function signingPlan(file: string, platform: NodeJS.Platform, env: Env, signtool = 'signtool'): SigningPlan {
  if (platform === 'win32') {
    const cert = env.DUVARRET_WIN_CERT;
    if (!cert) return { skipped: 'Sin firmar: define DUVARRET_WIN_CERT y DUVARRET_WIN_CERT_PASSWORD para firmar el .exe.' };
    const password = env.DUVARRET_WIN_CERT_PASSWORD ?? '';
    return {
      steps: [
        {
          label: 'Firma (signtool)',
          command: env.DUVARRET_SIGNTOOL ?? signtool,
          args: ['sign', '/f', cert, ...(password ? ['/p', password] : []), '/fd', 'sha256', '/tr', env.DUVARRET_TIMESTAMP_URL ?? DEFAULT_TIMESTAMP, '/td', 'sha256', file],
          secrets: password ? [password] : [],
        },
        { label: 'Comprobación de la firma', command: env.DUVARRET_SIGNTOOL ?? signtool, args: ['verify', '/pa', file] },
      ],
    };
  }
  if (platform === 'darwin') {
    const identity = env.DUVARRET_MAC_IDENTITY;
    if (!identity) return { skipped: 'Sin firmar: define DUVARRET_MAC_IDENTITY (y APPLE_ID, APPLE_TEAM_ID, APPLE_PASSWORD para notarizar).' };
    const timestamp = env.DUVARRET_TIMESTAMP_URL ? `--timestamp=${env.DUVARRET_TIMESTAMP_URL}` : '--timestamp';
    const steps: SignStep[] = [
      // «runtime» activa el Hardened Runtime, obligatorio para notarizar.
      { label: 'Firma (codesign)', command: 'codesign', args: ['--force', '--options', 'runtime', timestamp, '--sign', identity, file] },
      { label: 'Comprobación de la firma', command: 'codesign', args: ['--verify', '--strict', '--verbose=2', file] },
    ];
    const { APPLE_ID: appleId, APPLE_TEAM_ID: team, APPLE_PASSWORD: password } = env;
    if (!appleId || !team || !password) return { steps };
    const zip = `${file}.notarizar.zip`;
    steps.push(
      { label: 'Empaquetado para notarizar', command: 'ditto', args: ['-c', '-k', '--keepParent', file, zip] },
      {
        label: 'Notarización (Apple)',
        command: 'xcrun',
        args: ['notarytool', 'submit', zip, '--apple-id', appleId, '--team-id', team, '--password', password, '--wait'],
        secrets: [password],
      },
    );
    return { steps, cleanup: [zip] };
  }
  return { skipped: 'Linux no exige firma de código.' };
}

/** Busca signtool en el Windows SDK si no está en el PATH (los runners de GitHub no lo añaden). */
export function findSigntool(): string {
  if (spawnSync('signtool', ['/?'], { stdio: 'ignore' }).status === 0) return 'signtool';
  const root = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin';
  if (!existsSync(root)) return 'signtool';
  const versions = readdirSync(root).filter((d) => /^10\./.test(d)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) {
    const candidate = join(root, version, process.arch === 'arm64' ? 'arm64' : 'x64', 'signtool.exe');
    if (existsSync(candidate)) return candidate;
  }
  return 'signtool';
}

export const redact = (text: string, secrets: string[] = []) => secrets.filter(Boolean).reduce((t, s) => t.split(s).join('***'), text);

/** Firma `file` según el entorno. Devuelve un mensaje para el registro; lanza si un paso falla. */
export function signExecutable(file: string, env: Env = process.env): string {
  const plan = signingPlan(file, process.platform, env, process.platform === 'win32' ? findSigntool() : 'signtool');
  if ('skipped' in plan) return plan.skipped;
  try {
    for (const step of plan.steps) {
      const run = spawnSync(step.command, step.args, { encoding: 'utf8' });
      if (run.status !== 0) {
        const output = redact(`${run.stdout ?? ''}${run.stderr ?? ''}${run.error ? String(run.error) : ''}`, step.secrets).trim().slice(-800);
        throw new Error(`${step.label} falló:\n${output}`);
      }
    }
  } finally {
    for (const path of plan.cleanup ?? []) rmSync(path, { force: true });
  }
  return `Firmado: ${plan.steps.map((s) => s.label).join(' · ')}`;
}
