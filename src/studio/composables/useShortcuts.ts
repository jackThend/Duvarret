import { onBeforeUnmount, onMounted } from 'vue';

export interface Shortcut {
  /** Combinación, p. ej. `mod+s`, `alt+arrowdown`, `mod+shift+a`. */
  keys: string;
  label: string;
  run: () => void;
}

export function matches(event: KeyboardEvent, keys: string): boolean {
  const parts = keys.toLowerCase().split('+');
  const key = parts.at(-1)!;
  const mod = parts.includes('mod');
  const wantsCtrlOrMeta = mod || parts.includes('ctrl');
  return (
    event.key.toLowerCase() === key &&
    (event.ctrlKey || event.metaKey) === wantsCtrlOrMeta &&
    event.altKey === parts.includes('alt') &&
    event.shiftKey === parts.includes('shift')
  );
}

/** Atajos globales accesibles con una mano (doc 04 §6). */
export function useShortcuts(shortcuts: () => Shortcut[]) {
  const handler = (event: KeyboardEvent) => {
    for (const shortcut of shortcuts()) {
      if (matches(event, shortcut.keys)) {
        event.preventDefault();
        shortcut.run();
        return;
      }
    }
  };
  onMounted(() => window.addEventListener('keydown', handler));
  onBeforeUnmount(() => window.removeEventListener('keydown', handler));
}

export function prettyKeys(keys: string): string {
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
  return keys
    .split('+')
    .map((k) => ({ mod: isMac ? '⌘' : 'Ctrl', shift: '⇧', alt: isMac ? '⌥' : 'Alt', arrowdown: '↓', arrowup: '↑', enter: '↵' })[k] ?? k.toUpperCase())
    .join(isMac ? '' : '+');
}
