<script setup lang="ts">
import { ref } from 'vue';
import type { Item } from '@/core/manifest';
import { useRuntimeServices } from '../services';

const props = defineProps<{ items: string[]; registry: Record<string, Item> }>();
const { resolveAsset } = useRuntimeServices();
const inspected = ref<string | null>(null);
const itemOf = (id: string) => props.registry[id];
</script>

<template>
  <aside class="dv-inventory" aria-label="Inventario" data-testid="inventory">
    <h3 class="dv-inventory-title">Inventario</h3>
    <p v-if="!items.length" class="dv-inventory-empty">No llevas nada.</p>
    <ul v-else>
      <li v-for="id in items" :key="id">
        <button type="button" class="dv-inventory-item" :aria-expanded="inspected === id" :data-testid="`item-${id}`" @click="inspected = inspected === id ? null : id">
          <img v-if="itemOf(id)?.icon" :src="resolveAsset(itemOf(id)!.icon!)" alt="" class="dv-inventory-icon" />
          <span>{{ itemOf(id)?.name ?? id }}</span>
        </button>
        <div v-if="inspected === id" class="dv-inventory-detail" data-testid="item-detail">
          <p>{{ itemOf(id)?.description }}</p>
          <p v-if="itemOf(id)?.is_inspectable && itemOf(id)?.inspect_content" class="dv-inventory-inspect">{{ itemOf(id)?.inspect_content }}</p>
        </div>
      </li>
    </ul>
  </aside>
</template>
