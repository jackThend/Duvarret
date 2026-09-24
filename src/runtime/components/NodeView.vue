<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { StoryNode } from '@/core/manifest';
import { useStoryStore } from '../stores/story';
import { useRuntimeServices } from '../services';
import { useReadingProgress } from '../composables/useReadingProgress';
import { successProbability } from '../engine/rng';
import ErgodicText from './ErgodicText.vue';
import ChoiceList from './ChoiceList.vue';
import VisualNovelOverlay from '../modules/VisualNovelOverlay.vue';
import ModuleSandbox from '../modules/ModuleSandbox.vue';

const props = withDefaults(defineProps<{ node: StoryNode; readingSpeed?: number }>(), { readingSpeed: 1 });
const store = useStoryStore();
const { resolveAsset, audio } = useRuntimeServices();

const text = computed(() => props.node.text_payload);
const speed = computed(() => props.readingSpeed);
const progress = useReadingProgress(text, (p) => store.setRevealProgress(p), { speed });
const dialogueDone = ref(false);
watch(
  () => props.node.node_id,
  () => (dialogueDone.value = false),
);

const vn = computed(() => props.node.visual_novel_overlay);
const showDialogue = computed(() => !!vn.value?.enabled && (vn.value.trigger === 'on_node_enter' || store.revealProgress >= 100));
const gameplay = computed(() => props.node.gameplay_overlay);
const showGameplay = computed(() => !!gameplay.value && store.revealProgress >= 100 && (!vn.value?.enabled || dialogueDone.value || !showDialogue.value));
const activeChecks = computed(() => props.node.rpg_checks.map((check, index) => ({ check, index })).filter((c) => c.check.type === 'active'));
const glossary = computed(() => props.node.glossary);
const solved = computed(() => store.solvedPuzzles.includes(props.node.node_id));

function onFeedback(kind: 'click' | 'error' | 'ok') {
  if (kind === 'ok') void audio?.confirmationPop({ x: 0, y: 0, z: 1 });
}

const pct = (p: number) => `${Math.round(p * 100)}%`;
</script>

<template>
  <article class="dv-node" :data-node="node.node_id" data-testid="node-view" @scroll.passive="progress.onScroll($event.target as HTMLElement)">
    <figure v-if="node.illustration?.asset" class="dv-illustration" :class="`dv-illustration-${node.illustration.placement}`">
      <img :src="resolveAsset(node.illustration.asset)" :alt="node.illustration.alt" />
    </figure>
    <h2 v-if="node.title" class="dv-node-title">{{ node.title }}</h2>

    <ErgodicText :text="node.text_payload" :engine="node.typographic_engine" :extra-texts="store.revealedExtraTexts" />

    <dl v-if="glossary.length" class="dv-glossary" aria-label="Glosario">
      <template v-for="entry in glossary" :key="entry.term">
        <dt>{{ entry.term }}</dt>
        <dd>{{ entry.definition }}</dd>
      </template>
    </dl>

    <VisualNovelOverlay
      v-if="showDialogue && vn"
      :overlay="vn"
      :characters="store.manifest?.character_registry ?? {}"
      :cps="store.manifest?.global_settings.typewriter_speed_cps"
      :backlog="store.backlog"
      @line="(speaker: string, line: string) => store.pushDialogue(speaker, line)"
      @finished="dialogueDone = true"
    />

    <ModuleSandbox v-if="showGameplay && gameplay" :overlay="gameplay" :solved="solved" @resolve="store.resolvePuzzle" @feedback="onFeedback" />

    <div v-if="activeChecks.length" class="dv-checks" aria-label="Pruebas del personaje">
      <div v-for="{ check, index } in activeChecks" :key="index" class="dv-check">
        <button v-if="!store.activeResults[index]" type="button" class="dv-choice" :data-testid="`check-${index}`" @click="store.rollActiveCheck(index)">
          🎲 {{ check.label ?? check.stat }} · dificultad {{ check.difficulty }} · probabilidad {{ pct(successProbability(store.stats[check.stat] ?? 0, check.difficulty)) }}
        </button>
        <p v-else role="status" class="dv-check-result" :data-testid="`check-result-${index}`">
          {{ check.label ?? check.stat }}: {{ store.activeResults[index]!.dice.join(' + ') }} → {{ store.activeResults[index]!.total }}
          {{ store.activeResults[index]!.passed ? '· Éxito' : '· Fracaso' }}
          <span v-if="store.activeResults[index]!.passed && check.on_pass_reveal_extra_text"> — {{ check.on_pass_reveal_extra_text }}</span>
          <span v-if="!store.activeResults[index]!.passed && check.on_fail_reveal_extra_text"> — {{ check.on_fail_reveal_extra_text }}</span>
        </p>
      </div>
    </div>

    <ChoiceList :choices="store.availableChoices" :disabled="store.puzzlePending" @choose="store.choose" @hover="store.hoverChoice" />

    <div class="dv-node-footer">
      <button v-if="store.revealProgress < 100" type="button" class="dv-link" data-testid="skip-reading" @click="progress.complete()">Revelar todo</button>
      <button v-if="store.canAdvance" type="button" class="dv-continue" data-testid="continue" @click="store.advance()">Continuar →</button>
      <p v-else-if="store.isEnding" class="dv-ending" data-testid="ending">— Fin —</p>
    </div>
  </article>
</template>
