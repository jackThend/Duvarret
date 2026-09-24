/**
 * Edición declarativa del manifiesto: el agente jamás escribe código; solo propone parches que
 * pasan por el validador. Lo alucinado se descarta o se sustituye por valores seguros (RNF-09).
 */
import {
  StoryNodeSchema,
  TolerantSchemas,
  checkIntegrity,
  formatPath,
  validateManifest,
  type ManifestIssue,
  type StoryManifest,
  type StoryNode,
} from '../manifest';

export interface PatchResult {
  ok: boolean;
  nodeId: string;
  issues: ManifestIssue[];
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

/** Mezcla profunda de objetos planos (las listas se reemplazan). */
export function deepMerge(base: Json, patch: Json): Json {
  const out: Json = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isObject(value) && isObject(base[key]) ? deepMerge(base[key] as Json, value) : value;
  }
  return out;
}

export class ManifestEditor {
  private manifest: StoryManifest;

  constructor(manifest: StoryManifest) {
    this.manifest = structuredClone(manifest);
  }

  get current(): StoryManifest {
    return this.manifest;
  }

  clone(): ManifestEditor {
    return new ManifestEditor(this.manifest);
  }

  node(nodeId: string): StoryNode | undefined {
    return this.manifest.nodes.find((n) => n.node_id === nodeId);
  }

  /** Aplica un parche a un nodo validándolo; si el nodo no existe, se crea. */
  patchNode(nodeId: string, patch: Json): PatchResult {
    const index = this.manifest.nodes.findIndex((n) => n.node_id === nodeId);
    const base: Json = index >= 0 ? (structuredClone(this.manifest.nodes[index]) as unknown as Json) : { node_id: nodeId };
    const merged = deepMerge(base, patch);
    merged.node_id = nodeId;

    const strict = StoryNodeSchema.safeParse(merged);
    const issues: ManifestIssue[] = strict.success
      ? []
      : strict.error.issues.map((issue) => ({
          severity: 'warning' as const,
          path: formatPath(issue.path),
          code: 'agent_repair',
          message: `Se ajustó una indicación del agente en «${formatPath(issue.path)}» por un valor seguro.`,
          nodeId,
        }));
    const node = strict.success ? strict.data : TolerantSchemas.node.parse(merged);
    if (index >= 0) this.manifest.nodes[index] = node;
    else this.manifest.nodes.push(node);
    return { ok: true, nodeId, issues };
  }

  /** Parche sobre el resto del manifiesto (registros de personajes, objetos…), siempre validado. */
  patchManifest(patch: Json): ManifestIssue[] {
    const merged = deepMerge(structuredClone(this.manifest) as unknown as Json, patch);
    const result = validateManifest(merged);
    this.manifest = result.manifest;
    return result.issues;
  }

  integrity(): ManifestIssue[] {
    return checkIntegrity(this.manifest);
  }
}
