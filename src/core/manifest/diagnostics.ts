/** Diagnósticos del manifiesto, con mensajes redactados para artistas (sin jerga técnica). */
export type Severity = 'error' | 'warning' | 'info';

export interface ManifestIssue {
  severity: Severity;
  /** Ruta dentro del manifiesto, p. ej. `nodes.0.acoustic_events.1.coordinates.z`. */
  path: string;
  /** Código estable para la interfaz y las pruebas. */
  code: string;
  /** Mensaje legible en lenguaje literario. */
  message: string;
  /** Nodo afectado, si aplica. */
  nodeId?: string;
}

export function formatPath(path: ReadonlyArray<PropertyKey>): string {
  return path.map((segment) => String(segment)).join('.');
}

export function hasBlockingIssues(issues: readonly ManifestIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}
