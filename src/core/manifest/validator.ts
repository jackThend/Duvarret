/**
 * Middleware de validación estricta con tolerancia a fallos (doc 03 §6, RNF-09).
 *
 * `validateManifest` jamás lanza: siempre devuelve un manifiesto reproducible y la lista de
 * desviaciones detectadas. La detección usa el esquema estricto; la reparación, el tolerante.
 */
import type { z } from 'zod';
import { formatPath, type ManifestIssue } from './diagnostics';
import { StoryManifestSchema, TolerantSchemas, type StoryManifest } from './schema';

export interface ValidationResult {
  manifest: StoryManifest;
  issues: ManifestIssue[];
  /** `true` si el documento cumplía el esquema estricto sin reparaciones. */
  pristine: boolean;
}

function nodeIdAt(input: unknown, path: ReadonlyArray<PropertyKey>): string | undefined {
  if (path[0] !== 'nodes' || typeof path[1] !== 'number') return undefined;
  if (!input || typeof input !== 'object') return undefined;
  const nodes = (input as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) return undefined;
  const node: unknown = nodes[path[1]];
  if (node && typeof node === 'object' && typeof (node as { node_id?: unknown }).node_id === 'string') {
    return (node as { node_id: string }).node_id;
  }
  return undefined;
}

function describe(issue: z.core.$ZodIssue): { code: string; message: string } {
  const last = issue.path[issue.path.length - 1];
  const field = last === undefined ? 'la obra' : `«${String(last)}»`;
  switch (issue.code) {
    case 'invalid_value':
      return { code: 'unknown_directive', message: `La indicación ${field} no existe en el repertorio; se usará una opción segura.` };
    case 'unrecognized_keys':
      return {
        code: 'unknown_field',
        message: `Se ignoraron indicaciones desconocidas: ${issue.keys.map((k) => `«${k}»`).join(', ')}.`,
      };
    case 'too_big':
    case 'too_small':
      return { code: 'out_of_range', message: `El valor de ${field} está fuera de lo razonable; se ajustó a un valor seguro.` };
    case 'invalid_type':
      if (issue.input === undefined) {
        return { code: 'missing_field', message: `Falta ${field}; se completó con un valor por defecto.` };
      }
      return { code: 'invalid_value', message: `El valor de ${field} no tiene la forma esperada; se usó uno por defecto.` };
    case 'invalid_format':
      return { code: 'invalid_format', message: `El formato de ${field} no es válido; se usó uno por defecto.` };
    default:
      return { code: 'invalid_value', message: `El valor de ${field} no es válido; se usó uno por defecto.` };
  }
}

export function validateManifest(input: unknown): ValidationResult {
  const issues: ManifestIssue[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    issues.push({
      severity: 'error',
      path: '',
      code: 'not_a_manifest',
      message: 'El documento no describe una obra; se abrió una obra vacía para no perder la sesión.',
    });
    input = {};
  }

  const strict = StoryManifestSchema.safeParse(input);
  if (strict.success) {
    return { manifest: strict.data, issues, pristine: issues.length === 0 };
  }

  for (const issue of strict.error.issues) {
    const { code, message } = describe(issue);
    const nodeId = nodeIdAt(input, issue.path);
    issues.push({ severity: 'warning', path: formatPath(issue.path), code, message, ...(nodeId ? { nodeId } : {}) });
  }

  const manifest = TolerantSchemas.manifest.parse(input);

  // Nodos sin identificador: se les asigna uno estable para no perder su prosa.
  manifest.nodes.forEach((node, index) => {
    if (!node.node_id) {
      node.node_id = `nodo_${String(index + 1).padStart(3, '0')}`;
      issues.push({
        severity: 'warning',
        path: `nodes.${index}.node_id`,
        code: 'generated_node_id',
        message: `Una escena no tenía nombre interno; se la llamó «${node.node_id}».`,
        nodeId: node.node_id,
      });
    }
  });

  return { manifest, issues, pristine: false };
}

/** Parsea texto JSON de forma segura (nunca con `eval`) y valida el resultado. */
export function validateManifestText(text: string): ValidationResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    const result = validateManifest({});
    result.issues.unshift({
      severity: 'error',
      path: '',
      code: 'unreadable',
      message: 'El archivo de la obra está dañado o incompleto; se abrió una obra vacía para no perder la sesión.',
    });
    return result;
  }
  return validateManifest(data);
}
