/** Sigue las marcas respecto a la ventana visible y los contenedores que recortan la lectura. */
export function observeReadingMarkers(article: HTMLElement, reach: (name: string) => void): () => void {
  const anchors = [...article.querySelectorAll<HTMLElement>('[data-marker]')];
  const containers: HTMLElement[] = [];
  for (let el = article.parentElement; el; el = el.parentElement) {
    if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(el).overflowY)) containers.push(el);
  }
  const measure = () => {
    let top = 0;
    let bottom = window.innerHeight;
    for (const el of containers) {
      const rect = el.getBoundingClientRect();
      top = Math.max(top, rect.top + el.clientTop);
      bottom = Math.min(bottom, rect.top + el.clientTop + el.clientHeight);
    }
    if (bottom <= top || article.getClientRects().length === 0) return;
    const line = top + (bottom - top) * 0.65;
    // Recoge también marcas rebasadas con saltos rápidos; el store evita repetirlas.
    for (const anchor of anchors) {
      if (anchor.getBoundingClientRect().top <= line) reach(anchor.dataset.marker!);
    }
  };
  let frame = 0;
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure(); });
  };
  window.addEventListener('scroll', schedule, { capture: true, passive: true });
  window.addEventListener('resize', schedule);
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  resize?.observe(article);
  for (const container of containers) resize?.observe(container);
  schedule();
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('resize', schedule);
    resize?.disconnect();
  };
}
