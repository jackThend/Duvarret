<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ACTION_LABELS, DIRECTION_LABELS, defaultNarrativeParams, isNarrativeType, narrativeConfig, type NarrativeType } from '@/core/gameplay/narrative';
import { useRuntimeServices } from '../services';
import { narrativeSound } from './narrativeSound';

const props = defineProps<{ kind: string; parameters: Record<string, unknown>; title?: string; solved?: boolean }>();
const emit = defineEmits<{ success: []; failure: []; feedback: [kind: 'click' | 'error' | 'ok'] }>();
const { resolveAsset } = useRuntimeServices();
const type = computed<NarrativeType>(() => isNarrativeType(props.kind) ? props.kind : 'radio_tuning');
const problem = computed(() => { try { narrativeConfig(type.value, props.parameters); return ''; } catch (e) { return e instanceof Error ? e.message : 'Configuración no válida.'; } });
const p = computed(() => narrativeConfig(type.value, problem.value ? defaultNarrativeParams(type.value) : props.parameters));
const done = ref(!!props.solved), attempts = ref(0), status = ref(props.solved ? 'Esta escena ya fue completada.' : '');
const sound = narrativeSound(); onBeforeUnmount(() => sound.dispose());
const won = ref<boolean | null>(null);
watch(() => props.solved, solved => { if (solved && !done.value) { done.value = true; status.value = p.value.failure_text; sound.dispose(); } });
function finish(ok: boolean, detail = '') {
  if (done.value || problem.value) return;
  done.value = true; won.value = ok; sound.dispose(); status.value = `${detail ? `${detail} ` : ''}${ok ? p.value.success_text : p.value.failure_text}`;
  emit('feedback', ok ? 'ok' : 'error'); if (ok) emit('success'); else emit('failure');
}
function verify(ok: boolean, detail = '') {
  if (done.value || problem.value) return;
  if (ok) return finish(true, detail);
  attempts.value++; emit('feedback','error');
  if (attempts.value >= p.value.max_attempts) finish(false);
  else status.value = `Todavía no coincide. Intentos restantes: ${p.value.max_attempts - attempts.value}.`;
}
const a = ref(0), b = ref(0);
const tunedA = computed(() => Math.abs(a.value - p.value.target_a) <= p.value.tolerance);
const tunedB = computed(() => Math.abs(b.value - p.value.target_b) <= p.value.tolerance);
const order = ref(p.value.fragments.map((_, i) => i).reverse());
function move(i: number, delta: number) { const other = i + delta; if (other < 0 || other >= order.value.length || done.value) return; [order.value[i], order.value[other]] = [order.value[other]!, order.value[i]!]; }
function remember() { if (p.value.alternate_order.length && order.value.every((n,i) => n + 1 === p.value.alternate_order[i])) finish(false, 'Has elegido otra lectura del recuerdo.'); else verify(order.value.every((n,i) => n === i)); }
const turn = ref(0), trust = ref(0);
function respond(action: keyof typeof ACTION_LABELS) { if (done.value) return; trust.value += action === p.value.best_actions[turn.value] ? 1 : 0; turn.value++; if (turn.value === p.value.turns.length) finish(trust.value >= p.value.trust_required); else status.value = action === 'silence' ? 'El silencio también es una respuesta.' : action === 'wait' ? 'Dejas que la voz termine.' : 'Tu respuesta queda entre ambos.'; }
const step = ref(0), heard = ref(false), cues = ref(p.value.accessible_cues), audioError = ref('');
async function listen() { heard.value = true; try { await sound.play(p.value.directions[step.value]!); } catch { cues.value = true; audioError.value = 'No se pudo activar el sonido. La orientación escrita permite continuar.'; } }
function walk(direction: keyof typeof DIRECTION_LABELS) { if (!heard.value || done.value) return; if (direction !== p.value.directions[step.value]) return verify(false); step.value++; heard.value = false; if (step.value === p.value.directions.length) finish(true); else status.value = 'Te acercas. Escucha el siguiente tramo.'; }
const rubbed = ref<number[]>([]), wear = ref(0), pressure = ref(1);
const progress = computed(() => Math.round(rubbed.value.length / 48 * 100));
function rub(index: number) {
  if (done.value || rubbed.value.includes(index)) return;
  const cells = pressure.value > 1 ? [index, index-1, index+1] : [index];
  const fresh = cells.filter(n => n >= 0 && n < 48 && !rubbed.value.includes(n));
  rubbed.value.push(...fresh); wear.value += fresh.length * (pressure.value - 1) * 2;
  if (wear.value >= p.value.wear_limit) finish(false, 'La superficie se ha deteriorado.');
}
function rubStripe() { const first = Array.from({ length:48 }, (_, i) => i).filter(n => !rubbed.value.includes(n)).slice(0, 6); first.forEach(rub); }
const mixture = ref<number[]>([]), quantity = ref(1), temperature = ref(0), rest = ref(0);
function addIngredient(i: number) { if (!done.value && mixture.value.length < 100) mixture.value.push(...Array(Math.max(1, Math.min(10, quantity.value || 1))).fill(i) as number[]); }
function mix() { const target = p.value.amounts.flatMap((n,i) => Array(n).fill(i) as number[]); verify(target.length === mixture.value.length && target.every((n,i) => mixture.value[i] === n) && Math.abs(temperature.value-p.value.temperature) <= 5 && Math.abs(rest.value-p.value.rest) <= 5); }
const horizontal = ref(false), vertical = ref(false), rotation = ref(0);
const aligned = computed(() => horizontal.value === p.value.fold_horizontal && vertical.value === p.value.fold_vertical && rotation.value === p.value.rotation);
const positions = ref<(number | null)[]>(p.value.loads.map(() => null));
const difference = computed(() => positions.value.reduce<number>((sum,pos,i) => sum + (pos ?? 0) * p.value.weights[i]!,0));
const saved = computed(() => positions.value.reduce<number>((sum,pos,i) => sum + (pos ? p.value.values[i]! : 0),0));
const exposure = ref(0), development = ref(0);
const photoStyle = computed(() => ({ opacity: Math.max(.02,development.value / 100), filter: `brightness(${exposure.value / 45}) contrast(${1 + development.value / 80}) blur(${Math.max(0,(60-development.value)/12)}px)` }));
function stopPhoto() { const ok = exposure.value >= p.value.exposure_min && exposure.value <= p.value.exposure_max && development.value >= p.value.development_min && development.value <= p.value.development_max; finish(ok, ok ? p.value.revealed_text : ''); }
const stroke = ref<number[]>([]);
const points = computed(() => p.value.symbols.map((_,i) => { const angle = (i*2+1)*Math.PI/p.value.symbols.length; return { x: 50 + Math.cos(angle)*35, y: 50 + Math.sin(angle)*35 }; }));
function trace(i: number) { if (!done.value && stroke.value.length < p.value.symbols.length) stroke.value.push(i); }
function ritual() { verify(stroke.value.length === p.value.symbols.length && stroke.value.every((n,i) => n === i)); }
</script>

<template>
  <div class="dv-narrative-scene" :data-testid="`scene-${kind}`">
    <p class="scene-instructions">{{ p.instructions }}</p>
    <p v-if="problem" role="alert">Esta escena necesita una corrección del autor: {{ problem }} Puedes abandonarla para continuar.</p>
    <fieldset :disabled="done || !!problem" class="scene-controls">
      <template v-if="kind === 'radio_tuning'">
        <div class="radio-display" aria-hidden="true"><svg viewBox="0 0 300 50"><path :d="`M0 25 Q25 ${tunedA ? 0 : 20} 50 25T100 25T150 25T200 25T250 25T300 25`" /></svg><span>{{ Math.round(100 - Math.abs(a-p.target_a)) }} / {{ Math.round(100 - Math.abs(b-p.target_b)) }} · intensidad</span></div>
        <label>Receptor A · {{ a }}<input v-model.number="a" type="range" min="0" max="100" data-testid="radio-a" /></label><p role="status">{{ tunedA ? p.message_a : 'Interferencias en la primera señal…' }}</p>
        <label>Receptor B · {{ b }}<input v-model.number="b" type="range" min="0" max="100" data-testid="radio-b" /></label><p role="status">{{ tunedB ? p.message_b : 'La segunda voz todavía no se entiende.' }}</p>
        <button type="button" data-testid="scene-confirm" @click="verify(tunedA && tunedB)">Combinar las señales</button>
      </template>
      <template v-else-if="kind === 'memory_weave'">
        <ol class="memory-strips"><li v-for="(fragment,i) in order" :key="fragment"><span>{{ p.fragments[fragment] }}</span><button type="button" :disabled="i === 0" :aria-label="`Subir fragmento ${fragment+1}`" :data-testid="`memory-up-${i}`" @click="move(i,-1)">↑</button><button type="button" :disabled="i === order.length-1" :aria-label="`Bajar fragmento ${fragment+1}`" @click="move(i,1)">↓</button></li></ol>
        <button type="button" data-testid="scene-confirm" @click="remember">Aceptar esta reconstrucción</button>
      </template>
      <template v-else-if="kind === 'voice_negotiation'">
        <blockquote>{{ p.turns[Math.min(turn,p.turns.length-1)] }}</blockquote><p>Intervención {{ Math.min(turn+1,p.turns.length) }} / {{ p.turns.length }} · Confianza: {{ trust }}</p>
        <div class="scene-actions"><button v-for="(label,action) in ACTION_LABELS" :key="action" type="button" :data-testid="`voice-${action}`" @click="respond(action)">{{ label }}</button></div>
      </template>
      <template v-else-if="kind === 'sound_trail'">
        <p>Tramo {{ Math.min(step+1,p.directions.length) }} / {{ p.directions.length }}</p><button type="button" data-testid="trail-listen" @click="listen">Escuchar la presencia</button>
        <label><input v-model="cues" type="checkbox" /> Mostrar orientación escrita</label><p v-if="heard && cues" role="status" data-testid="trail-clue">La presencia viene de: {{ DIRECTION_LABELS[p.directions[step] || 'front'] }}.</p><p v-if="audioError" role="status">{{ audioError }}</p>
        <div class="scene-actions"><button v-for="(label,direction) in DIRECTION_LABELS" :key="direction" type="button" :disabled="!heard" :data-testid="`trail-${direction}`" @click="walk(direction)">{{ label }}</button></div>
      </template>
      <template v-else-if="kind === 'surface_rubbing'">
        <div class="rubbing-surface"><img v-if="p.artwork" :src="resolveAsset(p.artwork)" :alt="p.artwork_alt" class="scene-art" /><p class="rubbing-revelation" :style="{ opacity: progress/100 }">{{ p.revealed_text }}</p><div class="rubbing-grid"><button v-for="i in 48" :key="i" type="button" :style="{ opacity: rubbed.includes(i-1) ? 0 : 1 }" :aria-label="`Frotar zona ${i}`" @pointerdown.prevent="rub(i-1)" @pointerenter="($event.buttons === 1) && rub(i-1)" @click="rub(i-1)"></button></div></div>
        <label>Presión · {{ pressure }}<input v-model.number="pressure" type="range" min="1" max="3" data-testid="rubbing-pressure" /></label><p>Calco {{ progress }} % · Desgaste {{ wear }} / {{ p.wear_limit }}</p>
        <button type="button" data-testid="rubbing-stripe" @click="rubStripe">Frotar la siguiente franja</button><button type="button" data-testid="scene-confirm" @click="finish(progress >= p.reveal_required, progress >= p.reveal_required ? p.revealed_text : '')">Detenerse y leer el calco</button>
      </template>
      <template v-else-if="kind === 'alchemy_mix'">
        <div class="mix-bowl" :style="{ backgroundColor: `hsl(${mixture.reduce((s,i) => s+(i+1)*35,0)%360} 25% ${20+Math.min(40,mixture.length*4)}%)` }" aria-hidden="true"></div>
        <label>Cantidad a añadir<input v-model.number="quantity" type="number" min="1" max="10" data-testid="mix-quantity" /></label><div class="scene-actions"><button v-for="(ingredient,i) in p.ingredients" :key="i" type="button" :data-testid="`mix-add-${i}`" @click="addIngredient(i)">Añadir {{ ingredient }}</button></div>
        <p data-testid="mix-contents">{{ mixture.length ? mixture.map(i => p.ingredients[i]).join(' → ') : 'El recipiente está vacío.' }}</p><button type="button" @click="mixture = []">Vaciar recipiente</button>
        <label>Temperatura · {{ temperature }}<input v-model.number="temperature" type="range" min="0" max="100" data-testid="mix-temperature" /></label><label>Reposo · {{ rest }}<input v-model.number="rest" type="range" min="0" max="100" data-testid="mix-rest" /></label><button type="button" data-testid="scene-confirm" @click="mix">Preparar la mezcla</button>
      </template>
      <template v-else-if="kind === 'paper_fold'">
        <div class="paper-stage"><div class="fold-paper" :style="{ transform: `rotate(${rotation}deg)` }"><div v-for="(panel,i) in p.panels" :key="i" class="paper-piece" :style="{ left: `${vertical ? 0 : (i%2)*50}%`, top: `${horizontal ? 50 : Math.floor(i/2)*50}%`, transform: `scaleX(${vertical && i%2 ? -1 : 1}) scaleY(${horizontal && i<2 ? -1 : 1})`, backgroundImage: p.artwork ? `url(${JSON.stringify(resolveAsset(p.artwork))})` : undefined, backgroundPosition: `${i%2*100}% ${Math.floor(i/2)*100}%` }">{{ panel }}</div></div></div>
        <div class="scene-actions"><button type="button" :aria-pressed="horizontal" data-testid="fold-horizontal" @click="horizontal = !horizontal">Pliegue horizontal</button><button type="button" :aria-pressed="vertical" data-testid="fold-vertical" @click="vertical = !vertical">Pliegue vertical</button><button type="button" data-testid="fold-rotate" @click="rotation = (rotation+90)%360">Girar · {{ rotation }}°</button></div><button type="button" data-testid="scene-confirm" @click="verify(aligned,p.revealed_text)">Leer la superposición</button>
      </template>
      <template v-else-if="kind === 'burden_balance'">
        <div class="balance-beam" :style="{ transform: `rotate(${Math.max(-18,Math.min(18,difference*4))}deg)` }" aria-hidden="true">◯ ━━━━━━━━━ ◯</div><p>Diferencia de peso: {{ Math.abs(difference) }} / máximo {{ p.balance_tolerance }} · Valor conservado: {{ saved }} / mínimo {{ p.minimum_value }}</p>
        <label v-for="(load,i) in p.loads" :key="i">{{ load }} · peso {{ p.weights[i] }} / valor {{ p.values[i] }}<select v-model.number="positions[i]" :data-testid="`balance-${i}`"><option :value="null">Decidir…</option><option :value="-1">Lado izquierdo</option><option :value="1">Lado derecho</option><option :value="0">Dejar atrás</option></select></label><button type="button" :disabled="positions.some(p => p === null)" data-testid="scene-confirm" @click="finish(Math.abs(difference) <= p.balance_tolerance && saved >= p.minimum_value)">Aceptar el reparto</button>
      </template>
      <template v-else-if="kind === 'photo_development'">
        <div class="photo-tray"><img v-if="p.artwork" :src="resolveAsset(p.artwork)" :alt="development >= p.development_min ? p.artwork_alt : 'Una imagen que todavía no puedes distinguir'" class="scene-art" :style="photoStyle" /><div v-else class="photo-silhouette" :style="photoStyle" aria-hidden="true">◯<br />╱│╲</div></div>
        <label>Exposición · {{ exposure }}<input v-model.number="exposure" type="range" min="0" max="100" data-testid="photo-exposure" /></label><label>Baño de revelado · {{ development }}<input v-model.number="development" type="range" min="0" max="100" data-testid="photo-development" /></label><p v-if="development >= p.development_min">Algo empieza a distinguirse en la emulsión.</p><button type="button" data-testid="scene-confirm" @click="stopPhoto">Detener el revelado</button>
      </template>
      <template v-else-if="kind === 'symbol_ritual'">
        <div class="ritual-circle"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="38" /><polyline :points="stroke.map(i => `${points[i]!.x},${points[i]!.y}`).join(' ')" /></svg><button v-for="(symbol,i) in p.symbols" :key="i" type="button" :style="{ left: `${points[i]!.x}%`, top: `${points[i]!.y}%` }" :data-testid="`ritual-${i}`" @click="trace(i)">{{ symbol }}</button></div><p>{{ stroke.map(i => p.symbols[i]).join(' → ') || 'Todavía no has trazado el sello.' }}</p><div class="scene-actions"><button type="button" @click="stroke = []">Borrar trazado</button><button type="button" data-testid="scene-confirm" @click="ritual">Completar el ritual</button><button type="button" data-testid="ritual-break" @click="finish(false,'Has roto el ritual deliberadamente.')">Romper el ritual</button></div>
      </template>
    </fieldset>
    <p v-if="won && ['surface_rubbing','photo_development','paper_fold'].includes(kind)" class="scene-revelation">{{ p.revealed_text }}</p>
    <p v-if="status" role="status" aria-live="polite" class="scene-result" data-testid="narrative-result">{{ status }}</p>
  </div>
</template>

<style scoped>
.dv-narrative-scene { display: grid; gap: 1rem; font: inherit; }
.scene-instructions { line-height: 1.6; font-size: .95rem; }
.scene-controls { min-width: 0; display: grid; gap: .85rem; border: 0; padding: 0; }
.scene-controls label { display: grid; gap: .4rem; }
.scene-controls label, .scene-controls button, .scene-result, .scene-instructions { overflow-wrap: anywhere; }
.scene-controls input:not([type=checkbox]), .scene-controls select { width: 100%; min-height: 44px; color: inherit; background: var(--dv-story-bg,#181c22); border: 1px solid currentColor; padding: .35rem; border-radius: .35rem; }
.scene-controls button { min-height: 44px; max-width: 100%; padding: .5rem .75rem; border: 1px solid currentColor; border-radius: .4rem; color: inherit; background: transparent; cursor: pointer; }
.scene-controls button:disabled { opacity: .5; cursor: default; }
.scene-controls :focus-visible { outline: 2px solid var(--dv-story-accent,#d97706); outline-offset: 3px; }
.scene-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
.scene-result, .scene-revelation { padding: .75rem; border-left: 3px solid var(--dv-story-accent,#d97706); }
.radio-display { padding: .75rem; border: 1px solid currentColor; font-family: monospace; }
.radio-display svg { width: 100%; height: 60px; stroke: currentColor; fill: none; stroke-width: 2; }
.memory-strips { display: grid; gap: .6rem; padding: 0; list-style: none; }
.memory-strips li { display: flex; gap: .4rem; align-items: center; padding: .5rem; border: 1px solid currentColor; }
.memory-strips li span { flex: 1; min-width: 0; }
blockquote { font-size: 1.15rem; border-left: 2px solid currentColor; padding: 1rem; }
.rubbing-surface, .photo-tray { position: relative; aspect-ratio: 16/9; overflow: hidden; background: #171c22; }
.scene-art { display: block; width: 100%; height: 100%; object-fit: contain; }
.rubbing-grid { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(8,1fr); grid-template-rows: repeat(6,1fr); }
.rubbing-grid button { min-height: 0; padding: 0; border-radius: 0; border-color: #7773; background: #55555a; }
.rubbing-revelation { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; padding: 1rem; color: #fff; }
.mix-bowl { width: 100px; height: 80px; border: 4px double currentColor; border-radius: 10% 10% 50% 50%; margin: auto; }
.paper-stage { min-height: 270px; display: grid; place-items: center; overflow: hidden; }
.fold-paper { position: relative; width: 240px; max-width: 75%; aspect-ratio: 1; background: #e8d9b9; }
.paper-piece { position: absolute; width: 50%; height: 50%; display: grid; place-items: center; text-align: center; background-color: #e8d9b980; color: #302b24; border: 1px dashed #6e5b40; background-size: 200% 200%; padding: .25rem; overflow-wrap: anywhere; mix-blend-mode: multiply; }
.balance-beam { text-align: center; font-size: 1.2rem; padding: 2rem 0; white-space: nowrap; }
.photo-tray { border: 8px solid #514b47; }
.photo-silhouette { text-align: center; color: #d9d7ce; font-size: 3rem; padding: 1rem; }
.ritual-circle { position: relative; width: 300px; max-width: 100%; aspect-ratio: 1; margin: auto; }
.ritual-circle svg { width: 100%; height: 100%; stroke: currentColor; stroke-width: 1; fill: none; }
.ritual-circle button { position: absolute; transform: translate(-50%,-50%); max-width: 42%; overflow-wrap: anywhere; background: var(--dv-story-bg,#181c22); }
@media (max-width: 480px) { .memory-strips li { flex-wrap: wrap; }.memory-strips li span { flex-basis: 100%; } }
</style>
