import { afterEach, expect, it, vi } from 'vitest';
import { observeReadingMarkers } from './observeReadingMarkers';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); document.body.innerHTML = ''; });

it('al agotar el scroll alcanza las marcas visibles bajo la línea del 65 %, conservando las que quedan fuera', async () => {
  vi.useFakeTimers();
  const container = document.createElement('div');
  container.style.overflowY = 'auto';
  container.innerHTML = '<article><span data-marker="visible"></span><span data-marker="fuera"></span></article>';
  document.body.append(container);
  const article = container.querySelector('article')!;
  Object.defineProperties(container, { clientHeight: { value: 600 }, scrollHeight: { value: 800 } });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return { top: this.dataset.marker === 'visible' ? 410 : this.dataset.marker === 'fuera' ? 700 : 0, bottom: 600 } as DOMRect;
  });
  vi.spyOn(article, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  const reach = vi.fn();
  const stop = observeReadingMarkers(article, reach);
  await vi.advanceTimersByTimeAsync(30);
  expect(reach).not.toHaveBeenCalled();
  container.scrollTop = 100;
  container.dispatchEvent(new Event('scroll'));
  await vi.advanceTimersByTimeAsync(30);
  expect(reach).not.toHaveBeenCalled();
  container.scrollTop = 200;
  container.dispatchEvent(new Event('scroll'));
  await vi.advanceTimersByTimeAsync(30);
  expect(reach.mock.calls).toEqual([['visible']]);
  stop();
});
