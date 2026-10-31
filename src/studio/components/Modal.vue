<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const props = withDefaults(defineProps<{ title: string; wide?: boolean; dismissible?: boolean }>(), { dismissible: true });
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);
let previousFocus: HTMLElement | null = null;
const topmost = () => Array.from(document.querySelectorAll('[aria-modal="true"]')).at(-1) === panel.value;
const focusables = () => Array.from(panel.value?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex="0"]') ?? []).filter(el => !el.closest('[hidden], [inert]') && !(el.closest('details:not([open])') && el.tagName !== 'SUMMARY'));
function onKey(event: KeyboardEvent) {
  if (!topmost()) return;
  if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); if (props.dismissible) emit('close'); }
  if (event.key === 'Tab') {
    const items = focusables();
    const first = items[0];
    const last = items.at(-1);
    if (!first) { event.preventDefault(); panel.value?.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.value)) { event.preventDefault(); first.focus(); }
  }
}
function retainFocus(event: FocusEvent) {
  if (topmost() && event.target instanceof Node && !panel.value?.contains(event.target)) panel.value?.focus();
}
onMounted(async () => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.addEventListener('focusin', retainFocus);
  await nextTick();
  panel.value?.focus();
});
onBeforeUnmount(() => {
  document.removeEventListener('focusin', retainFocus);
  // Un diálogo que está sustituyendo a otro recibe el foco en su propio onMounted.
  if (previousFocus?.isConnected) previousFocus.focus();
});
</script>

<template>
  <div class="dv-modal-backdrop" @click.self="props.dismissible && emit('close')" @keydown.capture="onKey">
    <section ref="panel" class="dv-modal" :class="{ 'is-wide': wide }" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1">
      <header class="mb-4 flex items-center justify-between">
        <h2 class="font-prose text-xl">{{ title }}</h2>
        <button type="button" class="dv-icon-btn" :disabled="!dismissible" aria-label="Cerrar" data-testid="modal-close" @click="emit('close')">✕</button>
      </header>
      <slot />
    </section>
  </div>
</template>
