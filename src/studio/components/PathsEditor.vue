<script setup lang="ts">
import { computed, ref } from 'vue';
import { describeCondition, flagId, flagLabel, hasExit, knownFlags, knownStats, type Choice, type ChoiceCondition } from '@/core/manifest';
import { useProjectStore } from '../stores/project';
import { useStudioStore } from '../stores/studio';

/**
 * Caminos de la escena: continuación natural, elecciones, condiciones y marcas, sin tocar el
 * manifiesto a mano. Cada cambio se aplica de inmediato y se refleja en la vista previa.
 */
const project = useProjectStore();
const studio = useStudioStore();
const NEW_SCENE = '__nueva__';

type ConditionKind = 'required_flag' | 'forbidden_flag' | 'required_item' | 'min_stat';
const CONDITION_LABELS: Record<ConditionKind, string> = {
  required_flag: 'Si ya ocurrió…',
  forbidden_flag: 'Si no ha ocurrido…',
  required_item: 'Si lleva el objeto…',
  min_stat: 'Si un atributo llega a…',
};

const node = computed(() => project.selectedNode);
const nav = computed(() => node.value?.navigation);
const scenes = computed(() => project.nodes.map((n) => ({ id: n.node_id, label: n.title ?? n.node_id })));
/** Una continuación hacia sí misma dejaría al lector atrapado: solo se muestra si ya estaba elegida. */
const nextScenes = computed(() => scenes.value.filter((s) => s.id !== node.value?.node_id || s.id === nav.value?.default_next_node));
const optionLabel = (s: { id: string; label: string }) => (s.id === node.value?.node_id ? `${s.label} (esta misma escena)` : s.label);
const sceneIds = computed(() => new Set(project.nodes.map((n) => n.node_id)));
const flags = computed(() => knownFlags(project.manifest));
const stats = computed(() => knownStats(project.manifest));
const itemName = (id: string) => project.manifest.item_registry[id]?.name ?? id;
const puzzle = computed(() => node.value?.gameplay_overlay);
const sceneLabel = (id: string | undefined) => (id ? (scenes.value.find((s) => s.id === id)?.label ?? `«${id}» (no existe)`) : '—');

const adding = ref<number | null>(null);
const draft = ref<{ kind: ConditionKind; flag: string; item: string; stat: string; value: number }>({ kind: 'required_flag', flag: '', item: '', stat: '', value: 3 });
const newMark = ref<Record<number, string>>({});

function save(changes: Partial<{ default_next_node: string | undefined; choices: Choice[]; is_ending: boolean }>) {
  const current = nav.value;
  if (!node.value || !current) return;
  project.updateNavigation(node.value.node_id, {
    default_next_node: 'default_next_node' in changes ? changes.default_next_node : current.default_next_node,
    choices: changes.choices ?? current.choices.map((c) => ({ ...c })),
    is_ending: changes.is_ending ?? current.is_ending,
  });
}

/** Crea una escena nueva (sin enlazarla por su cuenta) y devuelve su identificador. */
function createScene(): string {
  const origin = node.value!.node_id;
  const id = project.addNode(origin, { link: false, select: false, title: 'Nueva escena' });
  project.select(origin);
  return id;
}

function setNext(value: string) {
  const target = value === NEW_SCENE ? createScene() : value || undefined;
  save({ default_next_node: target, ...(target ? { is_ending: false } : {}) });
}

function setEnding(ending: boolean) {
  save({ is_ending: ending, ...(ending ? { default_next_node: undefined } : {}) });
}

const choicesCopy = () => (nav.value?.choices ?? []).map((c) => ({ ...c, grant_flags: [...c.grant_flags], ...(c.condition ? { condition: { ...c.condition } } : {}) }));

function updateChoice(index: number, patch: Partial<Choice>) {
  const choices = choicesCopy();
  choices[index] = { ...choices[index]!, ...patch };
  save({ choices });
}

function setTarget(index: number, value: string) {
  updateChoice(index, { target_node: value === NEW_SCENE ? createScene() : value });
}

function addChoice() {
  const choices = choicesCopy();
  const target = scenes.value.find((s) => s.id !== node.value?.node_id)?.id ?? createScene();
  choices.push({ choice_text: 'Nueva elección', target_node: target, grant_flags: [] });
  save({ choices, is_ending: false });
}

function removeChoice(index: number) {
  const choices = choicesCopy();
  choices.splice(index, 1);
  save({ choices });
}

function moveChoice(index: number, delta: number) {
  const choices = choicesCopy();
  const target = index + delta;
  if (target < 0 || target >= choices.length) return;
  [choices[index], choices[target]] = [choices[target]!, choices[index]!];
  save({ choices });
}

function conditionEntries(condition: ChoiceCondition | undefined): { kind: ConditionKind; text: string }[] {
  if (!condition) return [];
  return (Object.keys(CONDITION_LABELS) as ConditionKind[])
    .filter((k) => condition[k] !== undefined)
    .map((kind) => ({ kind, text: describeCondition({ [kind]: condition[kind] } as ChoiceCondition, itemName) }));
}

function removeCondition(index: number, kind: ConditionKind) {
  const choice = choicesCopy()[index]!;
  const condition = { ...(choice.condition ?? {}) };
  delete condition[kind];
  updateChoice(index, { condition: Object.keys(condition).length ? condition : undefined });
}

function startCondition(index: number) {
  adding.value = index;
  draft.value = { kind: 'required_flag', flag: '', item: project.items[0]?.id ?? '', stat: stats.value[0] ?? '', value: 3 };
}

function confirmCondition(index: number) {
  const d = draft.value;
  const choice = choicesCopy()[index]!;
  const condition: ChoiceCondition = { ...(choice.condition ?? {}) };
  if (d.kind === 'required_flag' || d.kind === 'forbidden_flag') {
    const flag = flagId(d.flag);
    if (!flag) return;
    condition[d.kind] = flag;
  } else if (d.kind === 'required_item') {
    if (!d.item) return;
    condition.required_item = d.item;
  } else {
    const stat = flagId(d.stat);
    if (!stat) return;
    condition.min_stat = { stat, value: Number(d.value) || 0 };
  }
  updateChoice(index, { condition });
  adding.value = null;
}

function addMark(index: number) {
  const flag = flagId(newMark.value[index] ?? '');
  if (!flag) return;
  const choice = choicesCopy()[index]!;
  updateChoice(index, { grant_flags: [...new Set([...choice.grant_flags, flag])] });
  newMark.value = { ...newMark.value, [index]: '' };
}

function removeMark(index: number, flag: string) {
  const choice = choicesCopy()[index]!;
  updateChoice(index, { grant_flags: choice.grant_flags.filter((f) => f !== flag) });
}
</script>

<template>
  <section v-if="node && nav" class="dv-paths space-y-4" aria-label="Caminos de la escena" data-testid="paths-editor">
    <header class="flex items-center justify-between">
      <h3 class="dv-section-title">Caminos de la escena</h3>
      <button type="button" class="dv-btn-ghost" data-testid="open-paths-map" @click="studio.pathsMapOpen = true">Ver mapa de caminos</button>
    </header>

    <p v-if="puzzle && (puzzle.on_success.transition_to_node || puzzle.on_failure.transition_to_node)" class="text-xs text-dv-muted" data-testid="paths-puzzle">
      El enigma de esta escena decide el camino: si se resuelve, «{{ sceneLabel(puzzle.on_success.transition_to_node) }}»; si no, «{{ sceneLabel(puzzle.on_failure.transition_to_node) }}».
    </p>

    <div class="flex flex-wrap items-center gap-3 text-sm">
      <label class="flex items-center gap-2">
        <span class="text-dv-muted">Continuación natural</span>
        <select class="dv-select" :value="nav.default_next_node ?? ''" :disabled="nav.is_ending" data-testid="paths-next" @change="setNext(($event.target as HTMLSelectElement).value)">
          <option value="">— Ninguna —</option>
          <option v-for="s in nextScenes" :key="s.id" :value="s.id">{{ optionLabel(s) }}</option>
          <option :value="NEW_SCENE">＋ Escena nueva</option>
        </select>
      </label>
      <label class="flex items-center gap-2">
        <input type="checkbox" :checked="nav.is_ending" data-testid="paths-ending" @change="setEnding(($event.target as HTMLInputElement).checked)" />
        Esta escena es un final
      </label>
    </div>
    <p v-if="node && !hasExit(node)" class="text-xs text-dv-muted" data-testid="paths-implicit-ending">
      Esta escena no lleva a ninguna otra, así que la historia terminará aquí.
      <button type="button" class="dv-link" data-testid="paths-mark-ending" @click="setEnding(true)">Marcarla como final</button>
      o elige una continuación.
    </p>
    <p v-if="nav.default_next_node && !sceneIds.has(nav.default_next_node)" role="alert" class="text-xs text-dv-danger">La continuación lleva a una escena que ya no existe.</p>

    <ol class="space-y-3">
      <li v-for="(choice, i) in nav.choices" :key="i" class="dv-pitch !p-3" :data-testid="`choice-editor-${i}`">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs text-dv-muted" aria-hidden="true">{{ i + 1 }}</span>
          <input
            class="dv-input min-w-0 flex-1 font-prose"
            :value="choice.choice_text"
            :aria-label="`Texto de la elección ${i + 1}`"
            data-testid="choice-text"
            @change="updateChoice(i, { choice_text: ($event.target as HTMLInputElement).value })"
          />
          <span class="text-dv-muted" aria-hidden="true">→</span>
          <select class="dv-select max-w-[12rem]" :value="choice.target_node" :aria-label="`Destino de la elección ${i + 1}`" data-testid="choice-target" @change="setTarget(i, ($event.target as HTMLSelectElement).value)">
            <option v-if="!sceneIds.has(choice.target_node)" :value="choice.target_node">«{{ choice.target_node }}» (no existe)</option>
            <option v-for="s in scenes" :key="s.id" :value="s.id">{{ optionLabel(s) }}</option>
            <option :value="NEW_SCENE">＋ Escena nueva</option>
          </select>
          <button type="button" class="dv-icon-btn" :disabled="i === 0" :aria-label="`Subir la elección ${i + 1}`" @click="moveChoice(i, -1)">↑</button>
          <button type="button" class="dv-icon-btn" :disabled="i === nav.choices.length - 1" :aria-label="`Bajar la elección ${i + 1}`" @click="moveChoice(i, 1)">↓</button>
          <button type="button" class="dv-icon-btn" :aria-label="`Eliminar la elección ${i + 1}`" data-testid="choice-remove" @click="removeChoice(i)">✕</button>
        </div>
        <p v-if="!sceneIds.has(choice.target_node)" role="alert" class="mt-1 text-xs text-dv-danger">Esta elección lleva a una escena que no existe.</p>

        <div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span class="text-dv-muted">Aparece:</span>
          <span v-if="!conditionEntries(choice.condition).length" class="text-dv-muted">siempre</span>
          <span v-for="c in conditionEntries(choice.condition)" :key="c.kind" class="dv-chip" data-testid="condition-chip">
            {{ c.text }}
            <button type="button" :aria-label="`Quitar la condición ${c.text}`" @click="removeCondition(i, c.kind)">✕</button>
          </span>
          <button v-if="adding !== i" type="button" class="dv-link !opacity-80" data-testid="condition-add" @click="startCondition(i)">＋ condición</button>
        </div>
        <div v-if="adding === i" class="mt-2 flex flex-wrap items-center gap-2 text-xs" data-testid="condition-form">
          <select v-model="draft.kind" class="dv-select" aria-label="Tipo de condición" data-testid="condition-kind">
            <option v-for="(label, kind) in CONDITION_LABELS" :key="kind" :value="kind" :disabled="kind === 'required_item' && !project.items.length">{{ label }}</option>
          </select>
          <template v-if="draft.kind === 'required_flag' || draft.kind === 'forbidden_flag'">
            <input v-model="draft.flag" class="dv-input" list="dv-flags" placeholder="p. ej. alarma desactivada" aria-label="Acontecimiento" data-testid="condition-flag" @keydown.enter.prevent="confirmCondition(i)" />
          </template>
          <select v-else-if="draft.kind === 'required_item'" v-model="draft.item" class="dv-select" aria-label="Objeto">
            <option v-for="it in project.items" :key="it.id" :value="it.id">{{ it.name }}</option>
          </select>
          <template v-else>
            <input v-model="draft.stat" class="dv-input w-32" list="dv-stats" placeholder="atributo" aria-label="Atributo" data-testid="condition-stat" />
            <input v-model.number="draft.value" type="number" class="dv-input w-16" aria-label="Valor mínimo" data-testid="condition-value" />
          </template>
          <button type="button" class="dv-btn-accent" data-testid="condition-confirm" @click="confirmCondition(i)">Añadir</button>
          <button type="button" class="dv-btn-ghost" @click="adding = null">Cancelar</button>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span class="text-dv-muted">Deja la marca:</span>
          <span v-for="f in choice.grant_flags" :key="f" class="dv-chip" data-testid="mark-chip">
            {{ flagLabel(f) }}
            <button type="button" :aria-label="`Quitar la marca ${flagLabel(f)}`" @click="removeMark(i, f)">✕</button>
          </span>
          <input
            class="dv-input w-44"
            list="dv-flags"
            placeholder="＋ acontecimiento"
            :aria-label="`Marca que deja la elección ${i + 1}`"
            :value="newMark[i] ?? ''"
            data-testid="mark-input"
            @input="newMark = { ...newMark, [i]: ($event.target as HTMLInputElement).value }"
            @keydown.enter.prevent="addMark(i)"
            @change="addMark(i)"
          />
        </div>
      </li>
    </ol>
    <button type="button" class="dv-btn-ghost" data-testid="choice-add" @click="addChoice">＋ Nueva elección</button>

    <datalist id="dv-flags"><option v-for="f in flags" :key="f" :value="flagLabel(f)" /></datalist>
    <datalist id="dv-stats"><option v-for="s in stats" :key="s" :value="s" /></datalist>
  </section>
</template>
