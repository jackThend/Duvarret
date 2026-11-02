import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import RoomSearch from './RoomSearch.vue';

describe('habitación con linterna', () => {
  it('el objeto no se recoge a oscuras, se ilumina con teclado y se entrega una sola vez', async () => {
    const w = mount(RoomSearch, { props: { parameters: { item_label: 'Ganzúa', item_x: 72, item_y: 64 } } });
    expect(w.get('[data-testid="room-collect"]').attributes('disabled')).toBeDefined();
    const room = w.get('[data-testid="room-search"]');
    await room.trigger('keydown', { key: 'Enter' });
    expect(w.emitted('success')).toBeUndefined();
    for (let i = 0; i < 5; i++) await room.trigger('keydown', { key: 'ArrowRight' });
    for (let i = 0; i < 4; i++) await room.trigger('keydown', { key: 'ArrowDown' });
    expect(w.get('[data-testid="room-status"]').text()).toContain('Ganzúa');
    await room.trigger('keydown', { key: 'Enter' });
    await room.trigger('keydown', { key: 'Enter' });
    expect(w.emitted('success')).toHaveLength(1);
    expect(w.get('[data-testid="room-status"]').text()).toContain('recogido');
    w.unmount();
  });
});
