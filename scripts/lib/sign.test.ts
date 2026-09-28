import { describe, expect, it } from 'vitest';
import { redact, signingPlan } from './sign';

describe('signingPlan', () => {
  it('no firma sin certificados y dice cómo hacerlo', () => {
    expect(signingPlan('obra.exe', 'win32', {})).toEqual({ skipped: expect.stringContaining('DUVARRET_WIN_CERT') });
    expect(signingPlan('obra', 'darwin', {})).toEqual({ skipped: expect.stringContaining('DUVARRET_MAC_IDENTITY') });
    expect(signingPlan('obra', 'linux', { DUVARRET_WIN_CERT: 'x' })).toEqual({ skipped: 'Linux no exige firma de código.' });
  });

  it('en Windows firma con SHA-256, sello de tiempo y comprueba; la contraseña se marca como secreta', () => {
    const plan = signingPlan('obra.exe', 'win32', { DUVARRET_WIN_CERT: 'C:\\cert.pfx', DUVARRET_WIN_CERT_PASSWORD: 'clave' }, 'C:\\sdk\\signtool.exe');
    if ('skipped' in plan) throw new Error('debería firmar');
    expect(plan.steps.map((s) => s.command)).toEqual(['C:\\sdk\\signtool.exe', 'C:\\sdk\\signtool.exe']);
    expect(plan.steps[0]!.args).toEqual(['sign', '/f', 'C:\\cert.pfx', '/p', 'clave', '/fd', 'sha256', '/tr', 'http://timestamp.digicert.com', '/td', 'sha256', 'obra.exe']);
    expect(plan.steps[0]!.secrets).toEqual(['clave']);
    expect(plan.steps[1]!.args).toEqual(['verify', '/pa', 'obra.exe']);
  });

  it('en macOS firma con Hardened Runtime y solo notariza si hay credenciales de Apple', () => {
    const signOnly = signingPlan('obra', 'darwin', { DUVARRET_MAC_IDENTITY: 'Developer ID Application: Autora (ABC123)' });
    if ('skipped' in signOnly) throw new Error('debería firmar');
    expect(signOnly.steps[0]!.args).toEqual(['--force', '--options', 'runtime', '--timestamp', '--sign', 'Developer ID Application: Autora (ABC123)', 'obra']);
    expect(signOnly.steps).toHaveLength(2);

    const full = signingPlan('obra', 'darwin', { DUVARRET_MAC_IDENTITY: 'id', APPLE_ID: 'a@b.c', APPLE_TEAM_ID: 'ABC123', APPLE_PASSWORD: 'pw' });
    if ('skipped' in full) throw new Error('debería firmar');
    expect(full.steps.map((s) => s.label)).toEqual(['Firma (codesign)', 'Comprobación de la firma', 'Empaquetado para notarizar', 'Notarización (Apple)']);
    expect(full.steps[3]!.args).toContain('--wait');
    expect(full.steps[3]!.secrets).toEqual(['pw']);
    expect(full.cleanup).toEqual(['obra.notarizar.zip']);
  });

  it('oculta los secretos en los mensajes', () => {
    expect(redact('error con clave en /p clave', ['clave'])).toBe('error con *** en /p ***');
  });
});
