/** Señales sintéticas breves y locales. Solo se crean tras pulsar Escuchar. */
export function narrativeSound() {
  let context: AudioContext | undefined;
  return {
    async play(direction: 'left' | 'right' | 'front' | 'back') {
      context ??= new AudioContext(); await context.resume();
      const oscillator = context.createOscillator(), gain = context.createGain(), pan = context.createStereoPanner();
      oscillator.type = 'sine'; oscillator.frequency.value = direction === 'front' ? 740 : direction === 'back' ? 220 : 440;
      pan.pan.value = direction === 'left' ? -.9 : direction === 'right' ? .9 : 0;
      gain.gain.setValueAtTime(0, context.currentTime); gain.gain.linearRampToValueAtTime(.09, context.currentTime + .04); gain.gain.linearRampToValueAtTime(0, context.currentTime + .6);
      oscillator.connect(gain).connect(pan).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .65);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); pan.disconnect(); };
    },
    dispose() { void context?.close().catch(() => undefined); context = undefined; },
  };
}
