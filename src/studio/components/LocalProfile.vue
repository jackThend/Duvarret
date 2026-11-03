<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { personalLibrary } from '../services/personalLibrary';
const emit = defineEmits<{ saved: [name: string] }>();
const name = ref(''), autoCollect = ref(true), busy = ref(true), status = ref(''), error = ref('');
onMounted(async () => {
  try { const { profile } = await personalLibrary.load(); name.value = profile.name; autoCollect.value = profile.autoCollect; }
  catch { error.value = 'No se pudo abrir el perfil local. No se ha cambiado ningún dato.'; }
  finally { busy.value = false; }
});
async function save() {
  busy.value = true; status.value = error.value = '';
  try { await personalLibrary.saveProfile({ name: name.value.trim(), autoCollect: autoCollect.value }); status.value = 'Preferencias locales guardadas.'; emit('saved', name.value.trim()); }
  catch { error.value = 'No se pudo guardar el perfil. Vuelve a intentarlo.'; }
  finally { busy.value = false; }
}
</script>
<template>
  <details class="border-t border-dv-border pt-3" data-testid="local-profile">
    <summary class="cursor-pointer font-semibold">Perfil local · opcional</summary>
    <div class="mt-3 space-y-3">
      <p class="text-xs text-dv-muted">Tu nombre o seudónimo se propondrá al crear obras. Sin registro ni conexión; no cambia la autoría de las obras existentes.</p>
      <label class="block">Nombre o seudónimo<input v-model="name" maxlength="120" class="dv-input mt-1 w-full" autocomplete="nickname" data-testid="profile-name" :disabled="busy" /></label>
      <label class="flex items-start gap-2"><input v-model="autoCollect" type="checkbox" class="mt-1" :disabled="busy" data-testid="profile-auto-collect" /> Guardar en Mis recursos los archivos que importe o acepte, incluidas las voces generadas.</label>
      <button type="button" class="dv-btn-ghost" :disabled="busy" data-testid="profile-save" @click="save">Guardar preferencias</button>
      <p v-if="status" role="status" class="text-xs text-dv-muted">{{ status }}</p>
      <p v-if="error" role="alert" class="text-dv-danger">{{ error }}</p>
    </div>
  </details>
</template>
