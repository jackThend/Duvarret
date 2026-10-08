import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import ImportDialog from './ImportDialog.vue';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

async function choose(w: ReturnType<typeof mount>, name: string, content: string) {
  const input = w.get('[data-testid="import-file"]');
  Object.defineProperty(input.element, 'files', { value: [new File([content], name)], configurable: true });
  await input.trigger('change');
  await flushPromises();
}

describe('ImportDialog', () => {
  it('un archivo sin texto no deja listo el manuscrito anterior', async () => {
    const w = mount(ImportDialog);
    await choose(w, 'cuento.md', '# Uno\n\nEra una noche oscura y el viejo dormía en su cuarto.');
    expect(w.find('[data-testid="import-confirm"]').exists()).toBe(true);
    await choose(w, 'vacio.txt', '   \n\n ');
    expect(w.find('[data-testid="import-confirm"]').exists()).toBe(false);
    expect(w.get('[role="alert"]').text()).toContain('vacio.txt');
  });
});
