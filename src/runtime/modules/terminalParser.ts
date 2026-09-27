/**
 * Intérprete de comandos simulados de la terminal CRT. Es un parser de juego declarativo:
 * jamás ejecuta código; solo compara palabras con una tabla de comandos ficticios.
 */
import type { TerminalConfig } from './params';

export interface TerminalResult {
  output: string[];
  outcome?: 'success' | 'failure';
  clear?: boolean;
}

export function tokenize(line: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line))) tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  return tokens;
}

export class TerminalMachine {
  private failures = 0;
  connected: string | null = null;

  constructor(private readonly config: TerminalConfig) {}

  get attemptsLeft() {
    return this.config.max_attempts - this.failures;
  }

  run(line: string): TerminalResult {
    const trimmed = line.trim();
    if (!trimmed) return { output: [] };
    if (this.config.success_command && trimmed.toLowerCase() === this.config.success_command.toLowerCase()) {
      return { output: ['ACCESO CONCEDIDO.'], outcome: 'success' };
    }
    const [command = '', ...args] = tokenize(trimmed);
    switch (command.toLowerCase()) {
      case 'help':
      case 'ayuda':
        return { output: ['Comandos: help, ls, cat <archivo>, connect <host>, override <código>, whoami, clear'] };
      case 'ls':
        return { output: Object.keys(this.config.files).length ? Object.keys(this.config.files).sort() : ['(directorio vacío)'] };
      case 'cat': {
        const file = args[0];
        if (!file) return { output: ['uso: cat <archivo>'] };
        const content = this.config.files[file];
        return { output: content === undefined ? [`cat: ${file}: no existe`] : content.split('\n') };
      }
      case 'connect': {
        const host = args[0];
        if (!host) return { output: ['uso: connect <host>'] };
        if (this.config.hosts.length && !this.config.hosts.includes(host)) return { output: [`connect: ${host}: sin respuesta`] };
        this.connected = host;
        return { output: [`Conectado a ${host}.`] };
      }
      case 'override': {
        if (!this.config.target_code) return { output: ['override: no hay nada que anular aquí'] };
        if (args[0] === this.config.target_code) return { output: ['CÓDIGO ACEPTADO. ANULACIÓN COMPLETA.'], outcome: 'success' };
        this.failures++;
        if (this.failures >= this.config.max_attempts) return { output: ['CÓDIGO RECHAZADO. SISTEMA BLOQUEADO.'], outcome: 'failure' };
        return { output: [`CÓDIGO RECHAZADO. INTENTOS RESTANTES: ${this.attemptsLeft}`] };
      }
      case 'whoami':
        return { output: ['invitado'] };
      case 'clear':
        return { output: [], clear: true };
      default:
        return { output: [`${command}: orden no reconocida`] };
    }
  }
}
