<script setup lang="ts">
import { computed, ref } from 'vue';
import { DesktopParams } from './params';

const props = defineProps<{ parameters: Record<string, unknown>; title?: string }>();
const emit = defineEmits<{ success: []; failure: []; feedback: [kind: 'click' | 'error' | 'ok'] }>();

const config = computed(() => DesktopParams.parse(props.parameters));
const open = ref<string | null>(null);
const unlocked = ref<string[]>([]);
const asking = ref<string | null>(null);
const password = ref('');
const error = ref('');
const solved = ref(false);
const ICONS = { text: '📄', mail: '✉️', image: '🖼️', web: '🌐' } as const;

const current = computed(() => config.value.files.find((f) => f.name === open.value) ?? null);

function openFile(name: string) {
  const file = config.value.files.find((f) => f.name === name);
  if (!file) return;
  emit('feedback', 'click');
  if (file.password && !unlocked.value.includes(name)) {
    asking.value = name;
    password.value = '';
    error.value = '';
    return;
  }
  open.value = name;
  if (!solved.value && config.value.goal_file === name) {
    solved.value = true;
    emit('success');
  }
}

function unlock() {
  const file = config.value.files.find((f) => f.name === asking.value);
  if (!file) return;
  if (password.value === file.password) {
    unlocked.value.push(file.name);
    asking.value = null;
    emit('feedback', 'ok');
    openFile(file.name);
  } else {
    error.value = 'Contraseña incorrecta';
    emit('feedback', 'error');
  }
}
</script>

<template>
  <div class="dv-desktop" data-testid="fictional-desktop">
    <header class="dv-desktop-bar">{{ config.os_name }}</header>
    <div class="dv-desktop-body">
      <ul class="dv-desktop-icons" aria-label="Archivos del escritorio">
        <li v-for="file in config.files" :key="file.name">
          <button type="button" class="dv-desktop-icon" :data-testid="`file-${file.name}`" @dblclick="openFile(file.name)" @keydown.enter.prevent="openFile(file.name)" @click="openFile(file.name)">
            <span aria-hidden="true">{{ ICONS[file.kind] }}</span>
            <span>{{ file.name }}<template v-if="file.password && !unlocked.includes(file.name)"> 🔒</template></span>
          </button>
        </li>
      </ul>
      <section v-if="current" class="dv-desktop-window" role="dialog" :aria-label="current.name" data-testid="desktop-window">
        <header class="dv-desktop-bar">{{ current.name }} <button type="button" aria-label="Cerrar" @click="open = null">✕</button></header>
        <img v-if="current.kind === 'image'" :src="current.content" :alt="current.name" />
        <pre v-else class="dv-desktop-content">{{ current.content }}</pre>
      </section>
      <form v-if="asking" class="dv-desktop-window" data-testid="desktop-password" @submit.prevent="unlock">
        <header class="dv-desktop-bar">«{{ asking }}» está protegido</header>
        <label>Contraseña <input v-model="password" type="password" data-testid="desktop-password-input" /></label>
        <p role="alert">{{ error }}</p>
        <button type="submit">Abrir</button>
      </form>
    </div>
  </div>
</template>
