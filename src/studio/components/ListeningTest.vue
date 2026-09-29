<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { SpatialAudioEngine } from '@/runtime/audio/SpatialAudioEngine';
import { DIRECTIONS, DIRECTION_LABELS, KPI_TARGET, makeTrials, noiseBursts, scoreAnswers, type Answer, type Direction } from '@/runtime/audio/listeningTest';
import { encodeWav } from '@/core/assets/wav';
import Modal from './Modal.vue';

const props = defineProps<{ engine?: Pick<SpatialAudioEngine, 'play' | 'stop' | 'init' | 'backendKind'> }>();
const emit = defineEmits<{ close: [] }>();

const RATE = 44_100;
const wav = encodeWav(noiseBursts(RATE), RATE);
// Motor propio con el sonido de prueba en memoria: no depende de la obra abierta.
const engine = props.engine ?? new SpatialAudioEngine({ loadAsset: async () => wav.slice().buffer });

const trials = ref<Direction[]>([]);
const answers = ref<Answer[]>([]);
const heardOnce = ref(false);
const copied = ref(false);
const current = computed(() => trials.value[answers.value.length]);
const done = computed(() => trials.value.length > 0 && !current.value);
const score = computed(() => scoreAnswers(answers.value));
const pct = (v: number) => `${Math.round(v * 100)} %`;
const noFrontBack = computed(() => engine.backendKind === 'stereo_simple');

function start() {
  trials.value = makeTrials(3);
  answers.value = [];
  heardOnce.value = false;
  copied.value = false;
}

async function play() {
  if (!current.value) return;
  await engine.play('prueba_de_escucha.wav', { id: 'prueba', coordinates: DIRECTIONS[current.value], label: 'prueba de escucha' });
  heardOnce.value = true;
}

function answer(heard: Direction) {
  if (!current.value) return;
  engine.stop('prueba', 50);
  answers.value = [...answers.value, { expected: current.value, heard }];
  heardOnce.value = false;
}

async function copy() {
  const result = { ...score.value, engine: engine.backendKind, date: new Date().toISOString(), answers: answers.value };
  await navigator.clipboard?.writeText(JSON.stringify(result, null, 2)).catch(() => undefined);
  copied.value = true;
}

onBeforeUnmount(() => engine.stop('prueba', 0));
</script>

<template>
  <Modal title="Prueba de escucha 3D" @close="emit('close')">
    <div class="space-y-4 text-sm" data-testid="listening-test">
      <template v-if="!trials.length">
        <p>Ponte <strong>auriculares</strong>. Sonarán 12 ráfagas de ruido, cada una desde una dirección: delante, detrás, izquierda o derecha. Escucha cada una (puedes repetirla) y di de dónde viene.</p>
        <p class="text-xs text-dv-muted">Sirve para comprobar que el audio 3D funciona: el objetivo es acertar más del {{ pct(KPI_TARGET) }}. Hazla con varias personas y copia los resultados de cada una.</p>
        <button type="button" class="dv-btn-accent" data-testid="listening-start" @click="start">Empezar</button>
      </template>

      <template v-else-if="current">
        <p class="text-xs text-dv-muted" data-testid="listening-progress">Sonido {{ answers.length + 1 }} de {{ trials.length }}</p>
        <button type="button" class="dv-btn-accent" data-testid="listening-play" @click="play">▶ {{ heardOnce ? 'Repetir' : 'Escuchar' }}</button>
        <div class="grid w-64 grid-cols-3 gap-2" role="group" aria-label="¿De dónde viene?">
          <button v-for="(d, pos) in (['delante', 'izquierda', 'derecha', 'detras'] as const)" :key="d" type="button" class="dv-btn-ghost" :class="['col-start-2', 'col-start-1', 'col-start-3', 'col-start-2'][pos]" :disabled="!heardOnce" :data-testid="`listening-${d}`" @click="answer(d)">
            {{ DIRECTION_LABELS[d] }}
          </button>
        </div>
      </template>

      <template v-else-if="done">
        <p class="font-prose text-lg" data-testid="listening-score">{{ score.hits }} de {{ score.total }} ({{ pct(score.accuracy) }})</p>
        <p :class="score.passes ? 'text-dv-accent-2' : 'text-dv-danger'" data-testid="listening-verdict">
          {{ score.passes ? `Supera el objetivo del ${pct(KPI_TARGET)}.` : `No llega al objetivo del ${pct(KPI_TARGET)}.` }}
        </p>
        <ul class="text-xs">
          <li v-for="(value, d) in score.byDirection" :key="d">{{ DIRECTION_LABELS[d] }}: {{ pct(value) }}</li>
        </ul>
        <p v-if="score.frontBack" class="text-xs text-dv-muted">Confusiones delante/detrás: {{ score.frontBack }} (son las más habituales con auriculares).</p>
        <p v-if="noFrontBack" class="text-xs text-dv-danger">Este equipo usa sonido estéreo simple: no puede distinguir delante de detrás.</p>
        <div class="flex gap-2">
          <button type="button" class="dv-btn-ghost" data-testid="listening-copy" @click="copy">{{ copied ? 'Copiado' : 'Copiar resultados' }}</button>
          <button type="button" class="dv-btn-ghost" @click="start">Repetir</button>
        </div>
      </template>
    </div>
  </Modal>
</template>
