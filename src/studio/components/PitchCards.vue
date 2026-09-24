<script setup lang="ts">
import { computed, ref } from 'vue';
import { useStudioStore, type PitchCard } from '../stores/studio';

const studio = useStudioStore();
const adjusting = ref<string | null>(null);

/** Parámetros numéricos ajustables sin escribir código: se muestran como deslizadores. */
function numericFields(card: PitchCard) {
  const fields: { callIndex: number; path: string; label: string; value: number; min: number; max: number; step: number }[] = [];
  const LABELS: Record<string, [string, number, number, number]> = {
    column_width_rem: ['Anchura de la página', 14, 60, 1],
    bpm: ['Latidos por minuto', 40, 200, 1],
    amplitude: ['Intensidad del temblor', 0, 0.1, 0.005],
    intensity: ['Intensidad', 0, 1, 0.05],
    radius_px: ['Radio de la linterna', 60, 400, 10],
    duration_ms: ['Duración (ms)', 1000, 20000, 500],
    gain: ['Volumen', 0, 1, 0.05],
  };
  card.calls.forEach((call, callIndex) => {
    const params = (call.arguments.parameters ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(params)) {
      const spec = LABELS[key];
      if (spec && typeof value === 'number') fields.push({ callIndex, path: `parameters.${key}`, label: spec[0], value, min: spec[1], max: spec[2], step: spec[3] });
    }
    const coords = call.arguments.coordinates as { x: number; z: number } | undefined;
    if (coords) {
      fields.push({ callIndex, path: 'coordinates.x', label: 'Izquierda ↔ derecha (m)', value: coords.x, min: -15, max: 15, step: 0.5 });
      fields.push({ callIndex, path: 'coordinates.z', label: 'Detrás ↔ delante (m)', value: coords.z, min: -15, max: 15, step: 0.5 });
    }
  });
  return fields;
}

const cards = computed(() => studio.openPitches);
</script>

<template>
  <section class="space-y-3" aria-label="Propuestas del Agente Director" aria-live="polite" data-testid="pitch-cards">
    <article
      v-for="card in cards"
      :key="card.id"
      class="dv-pitch"
      :class="{ 'dv-pulse': studio.lastPulse === card.id }"
      :data-testid="`pitch-${card.id}`"
    >
      <header class="flex items-center gap-2 text-sm font-semibold text-dv-accent-2"><span aria-hidden="true">✦</span> {{ card.title }}</header>
      <p class="mt-1 font-prose text-[1.02rem] leading-relaxed">{{ card.rationale }}</p>
      <div v-if="adjusting === card.id" class="mt-3 space-y-2" data-testid="pitch-adjust">
        <label v-for="f in numericFields(card)" :key="f.path" class="flex items-center gap-3 text-xs text-dv-muted">
          <span class="w-44">{{ f.label }}</span>
          <input type="range" class="flex-1 accent-[var(--dv-accent)]" :min="f.min" :max="f.max" :step="f.step" :value="f.value" @input="studio.adjustPitch(card.id, f.callIndex, f.path, Number(($event.target as HTMLInputElement).value))" />
          <span class="w-12 text-right tabular-nums">{{ f.value }}</span>
        </label>
        <p v-if="!numericFields(card).length" class="text-xs text-dv-muted">Esta propuesta no tiene matices ajustables.</p>
      </div>
      <footer class="mt-3 flex flex-wrap gap-2">
        <button type="button" class="dv-btn-accent" data-testid="pitch-apply" @click="studio.applyPitch(card.id)">Aplicar al instante</button>
        <button type="button" class="dv-btn-ghost" :aria-expanded="adjusting === card.id" data-testid="pitch-adjust-toggle" @click="adjusting = adjusting === card.id ? null : card.id">Ajustar parámetros</button>
        <button v-if="card.alternatives?.length" type="button" class="dv-btn-ghost" data-testid="pitch-alternative" @click="studio.alternative(card.id)">Ver alternativa</button>
        <button type="button" class="dv-btn-ghost" data-testid="pitch-dismiss" @click="studio.dismissPitch(card.id)">Descartar</button>
      </footer>
    </article>
  </section>
</template>
