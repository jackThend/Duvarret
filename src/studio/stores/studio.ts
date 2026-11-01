/**
 * Estado de la estación de trabajo: tema, paneles, co-director (chat y Pitch Cards) y vista previa.
 */
import { defineStore } from 'pinia';
import { computed, ref, shallowRef, toRaw, watch } from 'vue';
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
import { OfflineSynthesizer, type SynthesisRequest, type SynthesisResult } from '@/core/assets/registry';
import type { StudioTheme } from '@/core/project';
import type { AudioWarning } from '@/runtime/audio/SpatialAudioEngine';
import { useProjectStore } from './project';
import { useAiStore } from './ai';
import { generateImage, providerFetch } from '../services/ai';
import { searchSoundBank } from '@/core/assets/freesound';

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
  /** Estado de la obra sobre el que se preparó el borrador. */
  baseManifest?: StoryManifest;
  executions?: ToolExecution[];
  status: 'open' | 'applied' | 'dismissed';
  source: 'proactive' | 'chat';
  alternatives?: PitchSuggestion[];
}

export interface PreviewNote { nodeId: string | null; asset: string; message: string }

export interface ProviderSettings {
  kind: ProviderKind;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

const SETTINGS_KEY = 'duvarret:studio-settings';
function safeEndpoint(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) return undefined;
    return value;
  } catch { return undefined; }
}

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
  const ai = useAiStore();
  const initial = loadSettings();

  const theme = ref<StudioTheme>(initial.theme);
  const leftCollapsed = ref(initial.leftCollapsed);
  const legacyKey = initial.provider.apiKey;
  const provider = ref<ProviderSettings>({ kind: initial.provider.kind, ...(initial.provider.model ? { model: initial.provider.model } : {}), ...(safeEndpoint(initial.provider.baseUrl) ? { baseUrl: safeEndpoint(initial.provider.baseUrl) } : {}) });
  const credentialError = ref('');
  let migratingCredentials = Boolean(legacyKey);
  function persistSettings() {
    if (migratingCredentials) return;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: theme.value, leftCollapsed: leftCollapsed.value, provider: { kind: provider.value.kind, model: provider.value.model, baseUrl: safeEndpoint(provider.value.baseUrl) } })); } catch { /* sin almacenamiento */ }
  }
  const credentialsReady = (async () => {
    try {
      // La copia legacy solo se retira del almacenamiento después de guardarla con éxito.
      if (legacyKey && initial.provider.kind !== 'local') await ai.saveKey(initial.provider.kind, legacyKey);
      migratingCredentials = false;
      persistSettings();
      await ai.initialize();
      const kind = provider.value.kind;
      if ((kind === 'compatible' || kind === 'ollama') && provider.value.baseUrl) {
        // Una dirección guardada en Conexiones es la fuente vigente. Solo se migra
        // la preferencia antigua cuando todavía no existe una dirección central.
        if (!ai.endpoints[kind]) await ai.saveEndpoint(kind, provider.value.baseUrl);
        delete provider.value.baseUrl;
        persistSettings();
      }
    } catch (cause) { credentialError.value = cause instanceof Error ? cause.message : 'No se pudo proteger la clave existente. La copia anterior se conserva para reintentar.'; }
  })();
  const chat = ref<ChatEntry[]>([]);
  const history = shallowRef<ChatMessage[]>([]);
  const pitches = ref<PitchCard[]>([]);
  const busy = ref(false);
  const graphOpen = ref(false);
  const settingsOpen = ref(false);
  const listeningOpen = ref(false);
  const exportOpen = ref(false);
  const importOpen = ref(false);
  const worksOpen = ref(false);
  const assetsOpen = ref(false);
  const narrationOpen = ref(false);
  const pathsMapOpen = ref(false);
  const mobilePreview = ref(false);
  const previewScreenless = ref(false);
  const previewStartNode = ref<string | null>(null);
  const previewNonce = ref(0);
  /** Avisos del motor de audio durante la vista previa («Falta el sonido "disparo"»), por escena. */
  const previewNotes = ref<PreviewNote[]>([]);
  const lastPulse = ref<string | null>(null);
  let chatCounter = 0;

  const serviceEndpoint = computed(() => {
    const kind = provider.value.kind;
    return kind === 'compatible' || kind === 'ollama' ? ai.endpoints[kind] ?? safeEndpoint(provider.value.baseUrl) : safeEndpoint(provider.value.baseUrl);
  });
  const providerIdentity = computed(() => JSON.stringify([provider.value.kind, provider.value.model, serviceEndpoint.value]));
  async function ensureProviderReady() {
    await credentialsReady;
    const kind = provider.value.kind;
    if ((kind === 'compatible' || kind === 'ollama') && provider.value.baseUrl) {
      // Compatibilidad con configuraciones antiguas y llamadas programáticas.
      // La interfaz nueva modifica directamente Conexiones, sin una segunda copia.
      await ai.saveEndpoint(kind, provider.value.baseUrl);
      delete provider.value.baseUrl;
    }
  }

  const orchestrator = computed(
    () =>
      new DirectorOrchestrator({
        provider: createProvider({
          kind: provider.value.kind,
          ...(provider.value.model ? { model: provider.value.model } : {}),
          ...(serviceEndpoint.value ? { baseUrl: serviceEndpoint.value } : {}),
          ...(provider.value.kind !== 'local' ? { fetch: providerFetch(provider.value.kind) } : {}),
        }),
      }),
  );

  watch(providerIdentity, () => { history.value = []; }, { flush: 'sync' });

  watch(
    [theme, leftCollapsed, provider],
    () => {
      persistSettings();
      if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme.value;
    },
    { deep: true, immediate: true },
  );

  // Una vista previa nueva (p. ej. tras aportar el archivo que faltaba) vuelve a comprobarlo todo.
  watch(previewNonce, () => { previewNotes.value = []; });

  const openPitches = computed(() => pitches.value.filter((p) => p.status === 'open' && p.nodeId === project.selectedNodeId));

  function say(role: ChatEntry['role'], text: string, pending = false) {
    const entry: ChatEntry = { id: ++chatCounter, role, text, pending };
    chat.value.push(entry);
    return entry;
  }

  function toolContext() {
    const work = project.workIdentity();
    return {
      ...(project.lore ? { lore: project.lore } : {}),
      ...(project.supervisor ? { supervisor: project.supervisor } : {}),
      assets: project.assets,
      isDraftAsset: (path: string) => project.draftAssets.has(path),
      // Lo creado vuelve como borrador: se escucha o se ve en la propuesta y solo se guarda al aceptarla.
      synthesizer: {
        provider: 'Studio',
        async synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
          if (request.type === 'voice') {
            const manner = request.style_preset === 'editorial' || request.style_preset === 'natural' ? '' : request.style_preset;
            const { path, provider } = await project.draftSpokenLine(request.prompt, manner);
            return { path, status: 'draft', provider };
          }
          if (request.type === 'sfx') {
            // Primero el banco libre (CC0); sin clave o sin resultados, queda reservado para que el autor lo aporte.
            if (!await ai.refresh('freesound')) return new OfflineSynthesizer().synthesize(request);
            const [sound] = await searchSoundBank(providerFetch('freesound'), request.prompt, { pageSize: 5 });
            if (!sound) return new OfflineSynthesizer().synthesize(request);
            const path = await project.draftBankSound(sound, request.prompt);
            return { path, status: 'draft', provider: `Freesound · ${sound.author} · CC0` };
          }
          if ((request.type !== 'portrait' && request.type !== 'background') || !await ai.refresh(ai.image.provider)) return new OfflineSynthesizer().synthesize(request);
          const prompt = `${request.prompt}\nEstilo: ${request.style_preset}`;
          const result = await generateImage({ provider: ai.image.provider, model: ai.image.model, accountId: ai.image.accountId, prompt });
          if (work !== project.workIdentity()) throw new Error('La obra cambió durante la creación de la imagen. La propuesta se ha descartado.');
          const extension = /jpe?g/.test(result.mimeType) ? 'jpg' : /webp/.test(result.mimeType) ? 'webp' : 'png';
          const path = project.stageGeneratedAsset({ name: `ilustracion-${Date.now()}.${extension}`, data: result.data }, { provider: `${result.provider} · ${result.model}`, prompt, style_preset: request.style_preset });
          return { path, status: 'draft', provider: `${result.provider} · ${result.model}` };
        },
      },
      timestamp: (project.selectedIndex + 1) * 1000,
    };
  }

  /** Recursos creados en una propuesta que esperan a que la autora la acepte o la descarte. */
  function draftsOf(executions: ToolExecution[] = []): string[] {
    return executions.flatMap((e) => {
      const result = e.outcome.result as Partial<SynthesisResult> | null;
      return e.call.name === 'requestAssetSynthesis' && !e.outcome.error && result?.status === 'draft' && result.path ? [result.path] : [];
    });
  }

  function discardDrafts(executions?: ToolExecution[]) {
    for (const path of draftsOf(executions)) project.discardGeneratedAsset(path);
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
    const suggestions = suggestForBeat(node.node_id, node.text_payload, { characters: project.characters.map((c) => c.id), node });
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
    const work = project.workIdentity();
    say('author', text);
    const selectedNodeId = project.selectedNodeId;
    const thinking = say('director', 'Pensando la puesta en escena…', true);
    busy.value = true;
    try {
      await ensureProviderReady();
      if (work !== project.workIdentity()) return null;
      const providerAtStart = providerIdentity.value;
      const baseManifest = toRaw(project.manifest);
      const turn = await orchestrator.value.run({
        message: text,
        manifest: baseManifest,
        history: history.value,
        context: directorContext(),
        tools: toolContext(),
      });
      const stale = work !== project.workIdentity() || providerAtStart !== providerIdentity.value || baseManifest !== toRaw(project.manifest);
      if (stale) discardDrafts(turn.executions);
      if (work !== project.workIdentity()) {
        thinking.pending = false;
        thinking.text = 'La obra cambió durante la petición. La propuesta se ha descartado.';
        return null;
      }
      if (providerAtStart !== providerIdentity.value) {
        thinking.pending = false;
        thinking.text = 'El modelo cambió durante la petición. Inicia una nueva conversación con el modelo elegido.';
        return null;
      }
      if (baseManifest !== toRaw(project.manifest)) {
        thinking.pending = false;
        thinking.text = 'La obra cambió desde esta propuesta. Genera otra para conservar tus cambios.';
        return null;
      }
      history.value = turn.history;
      thinking.pending = false;
      thinking.text = turn.reply || (turn.mutated ? 'He preparado una propuesta.' : 'Entendido.');
      project.touchAssets();
      // Una voz o una imagen creadas sin colocar también esperan en una propuesta para escucharlas.
      if ((turn.mutated || draftsOf(turn.executions).length) && selectedNodeId) {
        pitches.value.push({
          id: `chat:${Date.now()}:${chatCounter}`,
          nodeId: selectedNodeId,
          title: 'Propuesta del Agente Director',
          rationale: turn.executions.map((e) => e.outcome.summary).filter(Boolean).join(' '),
          calls: turn.executions.map((e) => e.call),
          draft: turn.draft,
          baseManifest,
          executions: turn.executions,
          status: 'open',
          source: 'chat',
        });
      } else {
        const notes = turn.executions.filter((e) => !e.outcome.mutates && e.outcome.summary).map((e) => e.outcome.summary);
        if (notes.length) say('director', notes.join(' '));
      }
      return turn;
    } catch (error) {
      // Los fallos del proveedor ya llegan como respuesta; esto cubre lo inesperado (p. ej. una herramienta).
      thinking.pending = false;
      thinking.text = `No pude completar la petición: ${error instanceof Error ? error.message : String(error)}`;
      return null;
    } finally {
      busy.value = false;
    }
  }

  async function applyPitch(id: string) {
    const card = pitches.value.find((p) => p.id === id);
    if (!card || card.status !== 'open') return false;
    const work = project.workIdentity();
    const baseManifest = toRaw(project.manifest);
    function rejectStaleDraft() {
      card!.status = 'dismissed';
      discardDrafts(executions);
      say('system', 'La obra cambió desde esta propuesta. Genera otra para conservar tus cambios.');
      return false;
    }
    let draft = card.draft;
    let executions = card.executions ?? [];
    if (draft && card.baseManifest && toRaw(card.baseManifest) !== baseManifest) return rejectStaleDraft();
    if (!draft) {
      // Tras ajustar parámetros se reaplica la propuesta, pero lo ya creado no se vuelve a crear.
      const created = draftsOf(executions).some((path) => project.draftAssets.has(path));
      const calls = created ? card.calls.filter((c) => c.name !== 'requestAssetSynthesis') : card.calls;
      const result = await orchestrator.value.applyCalls(calls, baseManifest, toolContext());
      draft = result.draft;
      executions = created ? [...executions.filter((e) => e.call.name === 'requestAssetSynthesis'), ...result.executions] : result.executions;
    }
    // La herramienta puede devolver un borrador anterior incluso si el generador
    // falló al detectar el cambio de obra. Nunca se integra sobre la nueva obra.
    if (work !== project.workIdentity()) return false;
    if (card.status !== 'open') { if (executions !== card.executions) discardDrafts(executions); return false; }
    if (baseManifest !== toRaw(project.manifest)) return rejectStaleDraft();
    // Aceptar la propuesta es lo único que guarda en la obra lo que el director creó.
    for (const path of draftsOf(executions)) await project.acceptGeneratedAsset(path);
    if (work !== project.workIdentity()) return false;
    if (baseManifest !== toRaw(project.manifest)) return rejectStaleDraft();
    project.applyDraft(draft);
    card.status = 'applied';
    lastPulse.value = id;
    previewNonce.value++;
    return true;
  }

  function dismissPitch(id: string) {
    const card = pitches.value.find((p) => p.id === id);
    if (!card) return;
    card.status = 'dismissed';
    discardDrafts(card.executions);
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

  /** El motor de audio del Studio avisa aquí; la vista previa lo muestra sin interrumpir la lectura. */
  function notePreviewAudio(message: string, detail?: AudioWarning) {
    if (detail?.kind !== 'missing_asset') return;
    const nodeId = detail.id.includes('::') ? detail.id.split('::')[0]! : null;
    if (previewNotes.value.some((n) => n.asset === detail.asset && n.nodeId === nodeId)) return;
    previewNotes.value = [...previewNotes.value, { nodeId, asset: detail.asset, message }];
  }

  function playFromHere() {
    previewStartNode.value = project.selectedNodeId;
    previewNonce.value++;
  }

  function reset() {
    for (const card of pitches.value) if (card.status === 'open') discardDrafts(card.executions);
    chat.value = [];
    history.value = [];
    pitches.value = [];
  }

  return {
    theme,
    leftCollapsed,
    provider,
    credentialsReady,
    credentialError,
    ensureProviderReady,
    serviceEndpoint,
    chat,
    pitches,
    openPitches,
    busy,
    graphOpen,
    settingsOpen,
    listeningOpen,
    exportOpen,
    importOpen,
    worksOpen,
    assetsOpen,
    narrationOpen,
    pathsMapOpen,
    mobilePreview,
    previewScreenless,
    previewStartNode,
    previewNonce,
    previewNotes,
    notePreviewAudio,
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
