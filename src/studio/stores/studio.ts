/**
 * Estado de la estación de trabajo: tema, paneles, co-director (chat y Pitch Cards) y vista previa.
 */
import { defineStore } from 'pinia';
import { computed, ref, shallowRef, watch } from 'vue';
import type { StoryManifest } from '@/core/manifest';
import {
  createProvider,
  DirectorOrchestrator,
  suggestForBeat,
  type ChatMessage,
  type PitchSuggestion,
  type ProviderKind,
  type ToolExecution,
} from '@/core/agent';
import { OfflineSynthesizer } from '@/core/assets/registry';
import type { StudioTheme } from '@/core/project';
import { useProjectStore } from './project';

export interface ChatEntry {
  id: number;
  role: 'author' | 'director' | 'system';
  text: string;
  pending?: boolean;
}

export interface PitchCard {
  id: string;
  nodeId: string;
  title: string;
  rationale: string;
  calls: PitchSuggestion['calls'];
  /** Borrador de la obra si se aplica la propuesta. */
  draft?: StoryManifest;
  executions?: ToolExecution[];
  status: 'open' | 'applied' | 'dismissed';
  source: 'proactive' | 'chat';
  alternatives?: PitchSuggestion[];
}

export interface ProviderSettings {
  kind: ProviderKind;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

const SETTINGS_KEY = 'duvarret:studio-settings';

function loadSettings(): { theme: StudioTheme; provider: ProviderSettings; leftCollapsed: boolean } {
  const fallback = { theme: 'nordic' as StudioTheme, provider: { kind: 'local' as ProviderKind }, leftCollapsed: false };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...fallback, ...(JSON.parse(raw) as object) } : fallback;
  } catch {
    return fallback;
  }
}

export const useStudioStore = defineStore('duvarret-studio', () => {
  const project = useProjectStore();
  const initial = loadSettings();

  const theme = ref<StudioTheme>(initial.theme);
  const leftCollapsed = ref(initial.leftCollapsed);
  const provider = ref<ProviderSettings>(initial.provider);
  const chat = ref<ChatEntry[]>([]);
  const history = shallowRef<ChatMessage[]>([]);
  const pitches = ref<PitchCard[]>([]);
  const busy = ref(false);
  const graphOpen = ref(false);
  const settingsOpen = ref(false);
  const exportOpen = ref(false);
  const importOpen = ref(false);
  const mobilePreview = ref(false);
  const previewScreenless = ref(false);
  const previewStartNode = ref<string | null>(null);
  const previewNonce = ref(0);
  const lastPulse = ref<string | null>(null);
  let chatCounter = 0;

  const orchestrator = computed(
    () =>
      new DirectorOrchestrator({
        provider: createProvider({
          kind: provider.value.kind,
          ...(provider.value.model ? { model: provider.value.model } : {}),
          ...(provider.value.apiKey ? { apiKey: provider.value.apiKey } : {}),
          ...(provider.value.baseUrl ? { baseUrl: provider.value.baseUrl } : {}),
        }),
      }),
  );

  watch(
    [theme, leftCollapsed, provider],
    () => {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: theme.value, leftCollapsed: leftCollapsed.value, provider: provider.value }));
      } catch {
        /* sin almacenamiento local */
      }
      if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme.value;
    },
    { deep: true, immediate: true },
  );

  const openPitches = computed(() => pitches.value.filter((p) => p.status === 'open' && p.nodeId === project.selectedNodeId));

  function say(role: ChatEntry['role'], text: string, pending = false) {
    const entry: ChatEntry = { id: ++chatCounter, role, text, pending };
    chat.value.push(entry);
    return entry;
  }

  function toolContext() {
    return {
      ...(project.lore ? { lore: project.lore } : {}),
      ...(project.supervisor ? { supervisor: project.supervisor } : {}),
      assets: project.assets,
      synthesizer: new OfflineSynthesizer(),
      timestamp: (project.selectedIndex + 1) * 1000,
    };
  }

  function directorContext() {
    const node = project.selectedNode;
    return {
      ...(node ? { nodeId: node.node_id, nodeText: node.text_payload, ...(node.title ? { nodeTitle: node.title } : {}) } : {}),
      characters: project.characters.map((c) => c.id),
      items: project.items.map((i) => i.id),
    };
  }

  /** Propuestas proactivas del director para la escena actual. */
  function refreshPitches(nodeId = project.selectedNodeId) {
    const node = project.nodes.find((n) => n.node_id === nodeId);
    if (!node) return [];
    const suggestions = suggestForBeat(node.node_id, node.text_payload, { characters: project.characters.map((c) => c.id) });
    pitches.value = pitches.value.filter((p) => !(p.nodeId === node.node_id && p.source === 'proactive' && p.status === 'open'));
    const [first, ...rest] = suggestions;
    if (first) {
      pitches.value.push({ ...first, nodeId: node.node_id, status: 'open', source: 'proactive', alternatives: rest });
    }
    return suggestions;
  }

  /** Barra de entrada natural: el autor habla con su co-director. */
  async function ask(message: string) {
    const text = message.trim();
    if (!text || busy.value) return null;
    say('author', text);
    const thinking = say('director', 'Pensando la puesta en escena…', true);
    busy.value = true;
    try {
      const turn = await orchestrator.value.run({
        message: text,
        manifest: project.manifest,
        history: history.value,
        context: directorContext(),
        tools: toolContext(),
      });
      history.value = turn.history;
      thinking.pending = false;
      thinking.text = turn.reply || (turn.mutated ? 'He preparado una propuesta.' : 'Entendido.');
      project.touchAssets();
      if (turn.mutated && project.selectedNodeId) {
        pitches.value.push({
          id: `chat:${Date.now()}:${chatCounter}`,
          nodeId: project.selectedNodeId,
          title: 'Propuesta del Agente Director',
          rationale: turn.executions.map((e) => e.outcome.summary).filter(Boolean).join(' '),
          calls: turn.executions.map((e) => e.call),
          draft: turn.draft,
          executions: turn.executions,
          status: 'open',
          source: 'chat',
        });
      } else {
        const notes = turn.executions.filter((e) => !e.outcome.mutates && e.outcome.summary).map((e) => e.outcome.summary);
        if (notes.length) say('director', notes.join(' '));
      }
      return turn;
    } finally {
      busy.value = false;
    }
  }

  async function applyPitch(id: string) {
    const card = pitches.value.find((p) => p.id === id);
    if (!card || card.status !== 'open') return false;
    let draft = card.draft;
    if (!draft) {
      const result = await orchestrator.value.applyCalls(card.calls, project.manifest, toolContext());
      draft = result.draft;
    }
    project.applyDraft(draft);
    card.status = 'applied';
    lastPulse.value = id;
    previewNonce.value++;
    return true;
  }

  function dismissPitch(id: string) {
    const card = pitches.value.find((p) => p.id === id);
    if (card) card.status = 'dismissed';
  }

  /** «Ver alternativa»: rota a la siguiente propuesta para la misma escena. */
  function alternative(id: string) {
    const card = pitches.value.find((p) => p.id === id);
    const next = card?.alternatives?.shift();
    if (!card || !next) return false;
    card.alternatives!.push({ id: card.id, title: card.title, rationale: card.rationale, calls: card.calls });
    Object.assign(card, { id: next.id, title: next.title, rationale: next.rationale, calls: next.calls, draft: undefined });
    return true;
  }

  /** «Ajustar parámetros»: modifica los argumentos numéricos de una propuesta antes de aplicarla. */
  function adjustPitch(id: string, callIndex: number, path: string, value: unknown) {
    const card = pitches.value.find((p) => p.id === id);
    const call = card?.calls[callIndex];
    if (!card || !call) return;
    const keys = path.split('.');
    let target = call.arguments as Record<string, unknown>;
    for (const key of keys.slice(0, -1)) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      target = target[key] as Record<string, unknown>;
    }
    target[keys.at(-1)!] = value;
    card.draft = undefined;
  }

  function playFromHere() {
    previewStartNode.value = project.selectedNodeId;
    previewNonce.value++;
  }

  function reset() {
    chat.value = [];
    history.value = [];
    pitches.value = [];
  }

  return {
    theme,
    leftCollapsed,
    provider,
    chat,
    pitches,
    openPitches,
    busy,
    graphOpen,
    settingsOpen,
    exportOpen,
    importOpen,
    mobilePreview,
    previewScreenless,
    previewStartNode,
    previewNonce,
    lastPulse,
    orchestrator,
    say,
    ask,
    refreshPitches,
    applyPitch,
    dismissPitch,
    alternative,
    adjustPitch,
    playFromHere,
    reset,
  };
});
