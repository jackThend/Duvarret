/**
 * Parámetros de cada minijuego, validados de forma tolerante dentro de su propio sandbox:
 * un parámetro mal configurado jamás rompe el estado global de la historia (RNF-08).
 */
import { z } from 'zod';

const screen = z.enum(['crt_green_phosphor', 'crt_amber', 'lcd_blue']).catch('crt_green_phosphor');

export const CipherLockParams = z.object({
  prompt_text: z.string().catch('INTRODUZCA EL CÓDIGO:'),
  target_code: z.coerce.string().catch('0000'),
  max_attempts: z.number().int().min(1).max(99).catch(3),
  screen_type: screen,
  hint: z.string().optional().catch(undefined),
});

export const TerminalParams = z.object({
  screen_type: screen,
  prompt: z.string().catch('$'),
  boot_lines: z.array(z.string()).catch(['SISTEMA LISTO.', 'Escriba "help" para ver los comandos.']),
  files: z.record(z.string(), z.string()).catch({}),
  hosts: z.array(z.string()).catch([]),
  target_code: z.coerce.string().optional().catch(undefined),
  success_command: z.string().optional().catch(undefined),
  max_attempts: z.number().int().min(1).max(99).catch(3),
});

export const CircuitParams = z.object({
  colors: z.array(z.string()).min(2).max(8).catch(['rojo', 'azul', 'amarillo', 'verde']),
  seed: z.number().int().catch(7),
  max_mistakes: z.number().int().min(1).max(20).catch(4),
});

const desktopFile = z.object({
  name: z.string(),
  kind: z.enum(['text', 'mail', 'image', 'web']).catch('text'),
  content: z.string().catch(''),
  password: z.string().optional().catch(undefined),
});

export const DesktopParams = z.object({
  os_name: z.string().catch('DUVARRET OS 95'),
  files: z.array(desktopFile).catch([]),
  goal_file: z.string().optional().catch(undefined),
});

export type CipherLockConfig = z.output<typeof CipherLockParams>;
export type TerminalConfig = z.output<typeof TerminalParams>;
export type CircuitConfig = z.output<typeof CircuitParams>;
export type DesktopConfig = z.output<typeof DesktopParams>;

export const SCREEN_COLORS: Record<CipherLockConfig['screen_type'], string> = {
  crt_green_phosphor: '#33ff66',
  crt_amber: '#ffb000',
  lcd_blue: '#7dd3fc',
};
