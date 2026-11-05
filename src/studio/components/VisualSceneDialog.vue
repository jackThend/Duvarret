<script setup lang="ts">
import { computed, provide, ref } from 'vue';
import { ManifestEditor } from '@/core/agent/manifestEditor';
import { configureVisualScene, setInventoryIllustration } from '@/core/visual/authoring';
import { RoomSearchParams } from '@/core/visual/room';
import { VISUAL_ATMOSPHERES, VISUAL_STYLES, VisualStyleSchema, type VisualRole } from '@/core/visual/style';
import { useProjectStore } from '../stores/project';
import { useStudioStore } from '../stores/studio';
import { presentAssets } from '../services/assetProbe';
import { RUNTIME_SERVICES } from '@/runtime/services';
import { Announcer } from '@/runtime/screenless/announcer';
import RoomSearch from '@/runtime/modules/RoomSearch.vue';
import Modal from './Modal.vue';
import VisualImagePicker from './VisualImagePicker.vue';

const emit = defineEmits<{ close: [] }>();
const project = useProjectStore(), studio = useStudioStore();
const identity = project.workIdentity(), nodeId = project.selectedNodeId;
const initial = project.selectedNode;
const config = RoomSearchParams.parse(initial?.gameplay_overlay?.parameters ?? {});
const mode = ref<'room' | 'illustration' | 'portrait' | 'item' | 'puzzle'>(initial?.gameplay_overlay?.type === 'room_search' ? 'room' : 'illustration');
const profile = ref(VisualStyleSchema.parse(project.manifest.global_settings.visual_style ?? {}));
const description = ref(initial?.gameplay_overlay?.type === 'room_search' ? config.image_alt : initial?.illustration?.alt || initial?.title || 'Una habitación abandonada');
const background = ref(config.image), object = ref(config.item_image || project.manifest.item_registry[config.item_id]?.icon || '');
const itemId = ref(config.item_id || initial?.gameplay_overlay?.on_success.grant_items[0] || '');
const itemLabel = ref(project.manifest.item_registry[itemId.value]?.name || config.item_label);
const itemDescription = ref(project.manifest.item_registry[itemId.value]?.description || '');
const characterId = ref(project.characters[0]?.id || ''), characterName = ref(''), mood = ref('neutral');
const x = ref(config.item_x), y = ref(config.item_y), itemSize = ref(config.item_size), radius = ref(config.radius_px);
const mandatory = ref(initial?.gameplay_overlay?.is_mandatory_to_advance ?? true);
const mainImage = ref(initial?.illustration?.asset || '');
const busyParts = ref<Record<string, boolean>>({}), saving = ref(false), error = ref(''), message = ref(''), testing = ref(false), collected = ref(false), attempt = ref(0);
const ratio = ref(16 / 9), dragging = ref(false);
const busy = computed(() => saving.value || Object.values(busyParts.value).some(Boolean));
const role = computed<VisualRole>(() => mode.value === 'room' ? 'background' : mode.value === 'portrait' ? 'portrait' : mode.value === 'puzzle' ? 'puzzle' : 'illustration');
const imageDescription = computed(() => mode.value === 'portrait' ? `${description.value}. Personaje: ${project.manifest.character_registry[characterId.value]?.name || characterName.value}. Expresión: ${mood.value || 'neutral'}.` : description.value);
const needsObject = computed(() => mode.value === 'room' || mode.value === 'item');
const parameters = computed(() => ({ image: background.value, image_alt: description.value, item_image: object.value, item_label: itemLabel.value, item_x: x.value, item_y: y.value, item_size: itemSize.value, radius_px: radius.value }));
provide(RUNTIME_SERVICES, { audio: null, announcer: new Announcer(), resolveAsset: project.resolveAsset });

function switchMode() {
  testing.value = false; message.value = error.value = '';
  mainImage.value = mode.value === 'puzzle' ? String(initial?.gameplay_overlay?.parameters.artwork || '') : mode.value === 'portrait' ? project.manifest.character_registry[characterId.value]?.sprites[mood.value] || '' : initial?.illustration?.asset || '';
}
function chooseItem() { const item = project.manifest.item_registry[itemId.value]; if (item) { itemLabel.value = item.name; itemDescription.value = item.description; object.value = item.icon || ''; } }
function chooseCharacter() { mainImage.value = project.manifest.character_registry[characterId.value]?.sprites[mood.value] || ''; }
function checkWork() { if (project.workIdentity() !== identity || project.selectedNodeId !== nodeId || !nodeId) throw new Error('La obra o la escena cambió. Abre de nuevo el editor visual.'); }
function loaded(event: Event) { const image = event.target as HTMLImageElement; if (image.naturalWidth && image.naturalHeight) ratio.value = image.naturalWidth / image.naturalHeight; }
function place(event: PointerEvent) {
  if (!dragging.value) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  x.value = Math.round(Math.max(5, Math.min(95, (event.clientX - rect.left) / rect.width * 100)));
  y.value = Math.round(Math.max(5, Math.min(95, (event.clientY - rect.top) / rect.height * 100)));
}
function startPlace(event: PointerEvent) { dragging.value = true; (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId); place(event); }
function key(event: KeyboardEvent) {
  const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (direction) { event.preventDefault(); x.value = Math.max(5, Math.min(95, x.value + direction[0]!)); y.value = Math.max(5, Math.min(95, y.value + direction[1]!)); }
}
function uniqueId(prefix: string, taken: Record<string, unknown>) { let id = `${prefix}_${nodeId}`; for (let n = 2; taken[id]; n++) id = `${prefix}_${nodeId}_${n}`; return id; }
async function save() {
  if (busy.value) return;
  saving.value = true; message.value = error.value = '';
  try {
    checkWork();
    const paths = mode.value === 'room' ? [background.value, object.value] : [mode.value === 'item' ? object.value : mainImage.value];
    if (paths.some(p => !p)) throw new Error(mode.value === 'room' ? 'Prepara y acepta el fondo y el objeto antes de aplicar.' : 'Prepara y acepta una imagen antes de aplicar.');
    if (!description.value.trim()) throw new Error('Describe la imagen para quien no pueda verla.');
    if (needsObject.value && !itemLabel.value.trim()) throw new Error('Dale un nombre al objeto.');
    const present = await presentAssets(paths, project.resolveAsset, project.assetOverrides); checkWork();
    if (paths.some(p => !present.has(p))) throw new Error('Falta una imagen. Súbela o elige otra antes de aplicar.');
    const editor = new ManifestEditor(project.manifest);
    editor.patchManifest({ global_settings: { visual_style: profile.value } });
    const id = itemId.value || uniqueId('hallazgo', project.manifest.item_registry);
    if (mode.value === 'room') {
      configureVisualScene(editor, { node_id: nodeId!, image: background.value, image_alt: description.value.trim(), item_id: id, item_label: itemLabel.value.trim(), item_description: itemDescription.value, item_image: object.value, item_x: x.value, item_y: y.value, item_size: itemSize.value, radius_px: radius.value, mandatory: mandatory.value, visual_style: profile.value });
    } else if (mode.value === 'item') {
      editor.patchManifest({ item_registry: { [id]: { name: itemLabel.value.trim(), description: itemDescription.value, icon: object.value } } });
      setInventoryIllustration(editor, id, object.value);
    } else if (mode.value === 'portrait') {
      const id = characterId.value || uniqueId('personaje', project.manifest.character_registry);
      if (!characterId.value && !characterName.value.trim()) throw new Error('Escribe el nombre del personaje.');
      editor.patchManifest({ character_registry: { [id]: { ...(characterId.value ? {} : { name: characterName.value.trim() }), sprites: { [mood.value.trim() || 'neutral']: mainImage.value } } } });
      characterId.value = id;
    } else if (mode.value === 'puzzle') {
      if (!project.selectedNode?.gameplay_overlay) throw new Error('Añade primero un puzle a esta escena desde el co-director.');
      editor.patchNode(nodeId!, { gameplay_overlay: { parameters: { artwork: mainImage.value, artwork_alt: description.value.trim() } } });
    } else editor.patchNode(nodeId!, { illustration: { asset: mainImage.value, alt: description.value.trim(), placement: initial?.illustration?.placement || 'header' } });
    project.applyDraft(editor.current);
    if (needsObject.value) itemId.value = id;
    await project.save(); studio.previewNonce++;
    message.value = mode.value === 'room' ? 'Escena guardada. Al recogerlo, el objeto desaparece del lugar y pasa al inventario con su imagen.' : 'Imagen y estilo guardados en la obra.';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { saving.value = false; }
}
</script>

<template>
  <Modal title="Dirección visual" wide :dismissible="!busy" @close="emit('close')">
    <div class="space-y-5" data-testid="visual-scene-dialog">
      <p class="text-sm text-dv-muted">Ilustra tu obra con dibujos por código, tus propias imágenes, Mis recursos o los proveedores que hayas configurado.</p>
      <label class="block text-sm">Qué quieres preparar<select v-model="mode" class="dv-select mt-1 w-full" :disabled="busy" data-testid="visual-mode" @change="switchMode"><option value="illustration">Ilustración o portada de escena</option><option value="room">Escenario con linterna y objeto recogible</option><option value="portrait">Personaje de novela visual</option><option value="item">Objeto de inventario</option><option value="puzzle">Entorno ilustrado de un puzle</option></select></label>
      <fieldset :disabled="busy" class="space-y-3"><legend class="mb-2 text-sm font-semibold">Estilo compartido de la obra</legend>
        <div class="grid gap-3 sm:grid-cols-2"><label class="text-xs">Aspecto<select v-model="profile.style" class="dv-select mt-1 w-full" data-testid="visual-style"><option v-for="(label, value) in VISUAL_STYLES" :key="value" :value="value">{{ label }}</option></select></label><label class="text-xs">Atmósfera<select v-model="profile.atmosphere" class="dv-select mt-1 w-full" data-testid="visual-atmosphere"><option v-for="(label, value) in VISUAL_ATMOSPHERES" :key="value" :value="value">{{ label }}</option></select></label></div>
        <label class="block text-xs">Continuidad visual<input v-model="profile.notes" maxlength="1200" class="dv-input mt-1 w-full" placeholder="Paleta, época, materiales o rasgos que quieras mantener…" data-testid="visual-style-notes" /></label>
        <label class="block text-sm">{{ mode === 'room' ? 'El lugar, sin el objeto recogible' : 'Descripción de la imagen' }}<textarea v-model="description" class="dv-input mt-1 w-full" maxlength="600" rows="2" placeholder="Un cuarto antiguo con un cuadro torcido, sin la llave…" data-testid="visual-description"></textarea></label>
      </fieldset>
      <div v-if="mode === 'portrait'" class="space-y-3"><label class="block text-xs">Personaje<select v-model="characterId" class="dv-select mt-1 w-full" data-testid="visual-character" @change="chooseCharacter"><option value="">Crear personaje</option><option v-for="c in project.characters" :key="c.id" :value="c.id">{{ c.name }}</option></select></label><input v-if="!characterId" v-model="characterName" aria-label="Nombre del personaje" class="dv-input w-full" data-testid="visual-character-name" /><label class="block text-xs">Expresión<input v-model="mood" class="dv-input mt-1 w-full" placeholder="neutral, asustado…" data-testid="visual-mood" @change="chooseCharacter" /></label></div>
      <fieldset v-if="needsObject" :disabled="busy" class="grid gap-3 sm:grid-cols-2"><legend class="mb-2 text-sm font-semibold">Objeto</legend><label class="text-xs">Inventario<select v-model="itemId" class="dv-select mt-1 w-full" data-testid="visual-item" @change="chooseItem"><option value="">Crear objeto</option><option v-for="i in project.items" :key="i.id" :value="i.id">{{ i.name }}</option></select></label><label class="text-xs">Nombre<input v-model="itemLabel" class="dv-input mt-1 w-full" data-testid="visual-item-name" maxlength="120" /></label><label class="text-xs sm:col-span-2">Descripción y aspecto del objeto<input v-model="itemDescription" class="dv-input mt-1 w-full" data-testid="visual-item-description" maxlength="2000" placeholder="Una llave de cobre corroído, con cabeza circular…" /></label></fieldset>
      <div class="grid items-start gap-5" :class="mode === 'room' ? 'sm:grid-cols-2' : ''">
        <VisualImagePicker v-if="mode !== 'item'" :key="role" :role="role" :label="mode === 'room' ? 'Fondo del escenario' : mode === 'portrait' ? 'Retrato y expresión' : mode === 'puzzle' ? 'Ilustración del entorno' : 'Ilustración'" :description="imageDescription" :profile="profile" :model-value="mode === 'room' ? background : mainImage" @update:model-value="mode === 'room' ? background = $event : mainImage = $event" @busy="busyParts.main = $event" />
        <VisualImagePicker v-if="needsObject" v-model="object" role="object" label="Imagen del objeto" :description="`${itemLabel}. ${itemDescription}`" :profile="profile" @busy="busyParts.object = $event" />
      </div>
      <section v-if="mode === 'room'" class="space-y-3" aria-label="Composición del escenario">
        <header class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-prose text-lg">Componer y explorar</h3><button type="button" class="dv-btn-ghost" :disabled="!background || !object || busy" data-testid="visual-test-toggle" @click="testing = !testing; collected = false; attempt++">{{ testing ? 'Volver a colocar' : 'Probar linterna' }}</button></header>
        <template v-if="!testing"><p class="text-xs text-dv-muted">Arrastra o toca donde quieras dejar el objeto. También puedes moverlo con las flechas o ajustar sus coordenadas. Se conserva la imagen completa en móvil.</p>
          <div class="visual-composition" :style="{ aspectRatio: String(ratio) }" tabindex="0" role="group" aria-label="Posición del objeto en el escenario" data-testid="visual-composition" @pointerdown.prevent="startPlace" @pointermove="place" @pointerup="dragging = false" @pointercancel="dragging = false" @keydown="key"><img v-if="background" :src="project.resolveAsset(background)" :alt="description" class="visual-background" draggable="false" @load="loaded" /><img v-if="object" :src="project.resolveAsset(object)" :alt="itemLabel" class="visual-object" :style="{ left: `${x}%`, top: `${y}%`, width: `${itemSize}%` }" draggable="false" /></div>
          <fieldset :disabled="busy" class="grid gap-3 sm:grid-cols-2"><label class="text-xs">Horizontal (%)<input v-model.number="x" type="number" min="5" max="95" class="dv-input mt-1 w-full" data-testid="visual-x" /></label><label class="text-xs">Vertical (%)<input v-model.number="y" type="number" min="5" max="95" class="dv-input mt-1 w-full" data-testid="visual-y" /></label><label class="text-xs">Tamaño del objeto (%)<input v-model.number="itemSize" type="range" min="3" max="25" class="mt-2 w-full" data-testid="visual-item-size" /></label><label class="text-xs">Radio de luz<input v-model.number="radius" type="range" min="50" max="250" class="mt-2 w-full" data-testid="visual-radius" /></label><label class="text-xs sm:col-span-2"><input v-model="mandatory" type="checkbox" data-testid="visual-mandatory" /> Recogerlo antes de continuar</label></fieldset>
        </template>
        <template v-else><RoomSearch :key="attempt" :parameters="parameters" title="Prueba del escenario" @success="collected = true" /><aside v-if="collected" class="flex items-center gap-3 text-sm" data-testid="visual-test-inventory"><img :src="project.resolveAsset(object)" alt="" class="h-12 w-12 object-contain" /><span>{{ itemLabel }} · Inventario de prueba</span></aside><p class="text-xs text-dv-muted">Esta prueba no altera el inventario de tu obra.</p></template>
      </section>
      <p v-if="mode === 'puzzle'" class="text-xs text-dv-muted">La ilustración acompaña el mecanismo. Sus controles, pistas y salidas siguen funcionando por código.</p><p v-if="mode === 'item'" class="text-xs text-dv-muted">Preparar el objeto no lo entrega al lector. Vincúlalo a una búsqueda con linterna o a una recompensa.</p>
      <footer class="flex flex-wrap gap-2"><button type="button" class="dv-btn-accent" :disabled="busy" data-testid="visual-apply" @click="save">{{ saving ? 'Guardando…' : 'Aplicar y guardar' }}</button><button type="button" class="dv-btn-ghost" :disabled="busy" @click="emit('close')">Cerrar</button></footer>
      <p v-if="message" role="status" class="text-sm" data-testid="visual-saved">{{ message }}</p><p v-if="error" role="alert" class="text-sm text-dv-danger" data-testid="visual-error">{{ error }}</p>
    </div>
  </Modal>
</template>

<style scoped>
.visual-composition { position: relative; width: 100%; overflow: hidden; border: 1px solid var(--dv-border); background: var(--dv-bg); touch-action: none; cursor: crosshair; border-radius: .5rem; }
.visual-composition:focus-visible { outline: 2px solid var(--dv-accent); outline-offset: 3px; }
.visual-background { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.visual-object { position: absolute; transform: translate(-50%, -50%); aspect-ratio: 1; object-fit: contain; outline: 1px dashed var(--dv-accent); }
</style>
