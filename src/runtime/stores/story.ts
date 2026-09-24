/**
 * Máquina de estados de la historia (Duvarret Runtime).
 *
 * Determinista: el mismo manifiesto y la misma secuencia de acciones producen siempre el
 * mismo estado. No depende de ningún modelo de lenguaje.
 */
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import type { AcousticTrigger, Choice, RpgCheck, StoryManifest, StoryNode } from '@/core/manifest';
import { validateManifest } from '@/core/manifest';
import { hashString, roll2d6, successProbability } from '../engine/rng';
import { applyOutcome, evaluateCondition, type GameState } from '../engine/state';

export type PlaybackStatus = 'idle' | 'reading' | 'ended';
export type PresentationMode = 'visual' | 'screenless';

export interface BacklogEntry {
  nodeId: string;
  speaker?: string;
  text: string;
}

export interface CheckResult {
  check: RpgCheck;
  passed: boolean;
  total: number;
  dice: [number, number];
  probability: number;
}

export interface RuntimeEvent {
  type: AcousticTrigger | 'node_exit';
  nodeId: string;
  value?: number;
}

export interface StorySnapshot {
  version: 1;
  nodeId: string | null;
  state: GameState;
  history: string[];
  rngState: number;
  solvedPuzzles: string[];
}

type Listener = (event: RuntimeEvent) => void;

export const useStoryStore = defineStore('duvarret-story', () => {
  const manifest = shallowRef<StoryManifest | null>(null);
  const currentNodeId = ref<string | null>(null);
  const status = ref<PlaybackStatus>('idle');
  const mode = ref<PresentationMode>('visual');
  const flags = ref<string[]>([]);
  const inventory = ref<string[]>([]);
  const stats = ref<Record<string, number>>({});
  const history = ref<string[]>([]);
  const backlog = ref<BacklogEntry[]>([]);
  const revealProgress = ref(0);
  const rngState = ref(1);
  const solvedPuzzles = ref<string[]>([]);
  const passiveResults = ref<CheckResult[]>([]);
  const activeResults = ref<Record<number, CheckResult>>({});
  const warnings = ref<string[]>([]);
  const firedThresholds = new Set<string>();
  const listeners = new Set<Listener>();

  const nodeIndex = computed(() => {
    const map = new Map<string, StoryNode>();
    for (const node of manifest.value?.nodes ?? []) map.set(node.node_id, node);
    return map;
  });

  const currentNode = computed<StoryNode | null>(() =>
    currentNodeId.value ? (nodeIndex.value.get(currentNodeId.value) ?? null) : null,
  );

  const gameState = computed<GameState>(() => ({ flags: flags.value, inventory: inventory.value, stats: stats.value }));

  const availableChoices = computed<{ choice: Choice; index: number }[]>(() =>
    (currentNode.value?.navigation.choices ?? [])
      .map((choice, index) => ({ choice, index }))
      .filter(({ choice }) => evaluateCondition(choice.condition, gameState.value)),
  );

  const puzzlePending = computed(() => {
    const node = currentNode.value;
    return !!node?.gameplay_overlay?.is_mandatory_to_advance && !solvedPuzzles.value.includes(node.node_id);
  });

  const canAdvance = computed(() => !!currentNode.value?.navigation.default_next_node && !puzzlePending.value);

  const isEnding = computed(() => {
    const node = currentNode.value;
    if (!node) return false;
    const nav = node.navigation;
    return (
      nav.is_ending ||
      (!nav.default_next_node && nav.choices.length === 0 && !node.gameplay_overlay && !(node.screenless_mode?.voice_prompts.length))
    );
  });

  const revealedExtraTexts = computed(() =>
    passiveResults.value
      .map((r) => (r.passed ? r.check.on_pass_reveal_extra_text : r.check.on_fail_reveal_extra_text))
      .filter((t): t is string => !!t),
  );

  function emit(event: RuntimeEvent) {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        warnings.value.push(`Un efecto no pudo reproducirse: ${String(error)}`);
      }
    }
  }

  function on(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function setState(next: GameState) {
    flags.value = next.flags;
    inventory.value = next.inventory;
    stats.value = next.stats;
  }

  function resolveCheck(check: RpgCheck, seed: number): { result: CheckResult; state: number } {
    const modifier = stats.value[check.stat] ?? 0;
    const roll = roll2d6(seed);
    const passed = roll.total + modifier >= check.difficulty;
    return {
      result: { check, passed, total: roll.total + modifier, dice: roll.dice, probability: successProbability(modifier, check.difficulty) },
      state: roll.state,
    };
  }

  /** Carga un manifiesto (se valida siempre, jamás se ejecuta código). */
  function load(input: StoryManifest | unknown) {
    const { manifest: validated } = validateManifest(input);
    manifest.value = validated;
    reset();
  }

  function reset() {
    const m = manifest.value;
    currentNodeId.value = null;
    status.value = 'idle';
    history.value = [];
    backlog.value = [];
    solvedPuzzles.value = [];
    passiveResults.value = [];
    activeResults.value = {};
    warnings.value = [];
    revealProgress.value = 0;
    firedThresholds.clear();
    setState({
      flags: [...(m?.initial_state.flags ?? [])],
      inventory: [...(m?.initial_state.inventory ?? [])],
      stats: { ...(m?.initial_state.stats ?? {}) },
    });
    rngState.value = m?.initial_state.rng_seed ?? 1;
    if (m?.global_settings.default_mode === 'audio_drama_screenless') mode.value = 'screenless';
  }

  function start(nodeId?: string) {
    const m = manifest.value;
    if (!m) return;
    const first = nodeId ?? m.initial_state.start_node ?? m.nodes[0]?.node_id;
    if (!first) {
      status.value = 'ended';
      return;
    }
    goTo(first);
  }

  function goTo(nodeId: string): boolean {
    const node = nodeIndex.value.get(nodeId);
    if (!node) {
      warnings.value.push(`La escena «${nodeId}» no existe; la lectura permanece en su lugar.`);
      if (!currentNodeId.value) status.value = 'ended';
      return false;
    }
    if (currentNodeId.value) emit({ type: 'node_exit', nodeId: currentNodeId.value });

    currentNodeId.value = nodeId;
    status.value = 'reading';
    revealProgress.value = 0;
    activeResults.value = {};
    history.value.push(nodeId);
    setState(applyOutcome(gameState.value, { grant_flags: node.grant_flags_on_enter, grant_items: node.grant_items_on_enter }));

    // Chequeos pasivos: semilla derivada del nodo para que sean estables en relecturas.
    let seed = (rngState.value ^ hashString(nodeId)) >>> 0;
    passiveResults.value = node.rpg_checks
      .filter((check) => check.type === 'passive')
      .map((check) => {
        const { result, state } = resolveCheck(check, seed);
        seed = state;
        return result;
      });
    for (const result of passiveResults.value) {
      setState(applyOutcome(gameState.value, { grant_flags: result.passed ? result.check.on_pass_grant_flags : result.check.on_fail_grant_flags }));
    }

    if (node.text_payload) backlog.value.push({ nodeId, text: node.text_payload });
    for (const key of [...firedThresholds]) if (key.startsWith(`${nodeId}::`)) firedThresholds.delete(key);
    emit({ type: 'on_node_enter', nodeId });
    return true;
  }

  function choose(index: number): boolean {
    const entry = availableChoices.value.find((c) => c.index === index);
    if (!entry || puzzlePending.value) return false;
    setState(applyOutcome(gameState.value, { grant_flags: entry.choice.grant_flags }));
    return goTo(entry.choice.target_node);
  }

  function advance(): boolean {
    if (!canAdvance.value) {
      if (isEnding.value) status.value = 'ended';
      return false;
    }
    return goTo(currentNode.value!.navigation.default_next_node!);
  }

  function hoverChoice(index: number) {
    if (currentNodeId.value) emit({ type: 'on_choice_hover', nodeId: currentNodeId.value, value: index });
  }

  /** Progreso de lectura 0–100; dispara los umbrales acústicos una sola vez por visita. */
  function setRevealProgress(percentage: number) {
    const node = currentNode.value;
    if (!node) return;
    const value = Math.max(0, Math.min(100, percentage));
    if (value <= revealProgress.value) return;
    revealProgress.value = value;
    for (const event of node.acoustic_events) {
      if (event.trigger !== 'on_text_reveal_percentage') continue;
      const threshold = event.trigger_value ?? 50;
      const key = `${node.node_id}::${event.event_id}`;
      if (value >= threshold && !firedThresholds.has(key)) {
        firedThresholds.add(key);
        emit({ type: 'on_text_reveal_percentage', nodeId: node.node_id, value: threshold });
      }
    }
    if (value >= 100) emit({ type: 'on_text_complete', nodeId: node.node_id });
  }

  /** Resuelve el minijuego del nodo actual con la señal aislada del sandbox. */
  function resolvePuzzle(success: boolean) {
    const node = currentNode.value;
    const overlay = node?.gameplay_overlay;
    if (!node || !overlay) return;
    if (!solvedPuzzles.value.includes(node.node_id)) solvedPuzzles.value.push(node.node_id);
    const outcome = success ? overlay.on_success : overlay.on_failure;
    setState(applyOutcome(gameState.value, outcome));
    if (success) emit({ type: 'on_puzzle_solve', nodeId: node.node_id });
    if (outcome.transition_to_node) goTo(outcome.transition_to_node);
  }

  /** Chequeo activo con probabilidad explícita (consume la secuencia aleatoria determinista). */
  function rollActiveCheck(index: number): CheckResult | null {
    const check = currentNode.value?.rpg_checks[index];
    if (!check || check.type !== 'active' || activeResults.value[index]) return activeResults.value[index] ?? null;
    const { result, state } = resolveCheck(check, rngState.value);
    rngState.value = state;
    activeResults.value = { ...activeResults.value, [index]: result };
    setState(applyOutcome(gameState.value, { grant_flags: result.passed ? check.on_pass_grant_flags : check.on_fail_grant_flags }));
    return result;
  }

  function pushDialogue(speaker: string, text: string) {
    if (currentNodeId.value) backlog.value.push({ nodeId: currentNodeId.value, speaker, text });
  }

  function setMode(next: PresentationMode) {
    mode.value = next;
  }

  function snapshot(): StorySnapshot {
    return {
      version: 1,
      nodeId: currentNodeId.value,
      state: { flags: [...flags.value], inventory: [...inventory.value], stats: { ...stats.value } },
      history: [...history.value],
      rngState: rngState.value,
      solvedPuzzles: [...solvedPuzzles.value],
    };
  }

  function restore(snap: StorySnapshot) {
    if (snap.version !== 1) return;
    setState({ flags: [...snap.state.flags], inventory: [...snap.state.inventory], stats: { ...snap.state.stats } });
    history.value = [...snap.history];
    rngState.value = snap.rngState;
    solvedPuzzles.value = [...snap.solvedPuzzles];
    if (snap.nodeId && nodeIndex.value.has(snap.nodeId)) {
      currentNodeId.value = snap.nodeId;
      status.value = 'reading';
      revealProgress.value = 0;
    }
  }

  return {
    manifest,
    currentNodeId,
    currentNode,
    status,
    mode,
    flags,
    inventory,
    stats,
    history,
    backlog,
    revealProgress,
    rngState,
    solvedPuzzles,
    passiveResults,
    activeResults,
    warnings,
    availableChoices,
    puzzlePending,
    canAdvance,
    isEnding,
    revealedExtraTexts,
    load,
    reset,
    start,
    goTo,
    choose,
    advance,
    hoverChoice,
    setRevealProgress,
    resolvePuzzle,
    rollActiveCheck,
    pushDialogue,
    setMode,
    snapshot,
    restore,
    on,
  };
});

export type StoryStore = ReturnType<typeof useStoryStore>;
