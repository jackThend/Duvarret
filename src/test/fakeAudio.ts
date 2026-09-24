/** AudioContext simulado para probar el motor de audio sin hardware (headless). */
/* eslint-disable @typescript-eslint/no-explicit-any */

export class FakeParam {
  value: number;
  events: [string, ...number[]][] = [];
  constructor(value = 0) {
    this.value = value;
  }
  setValueAtTime(v: number, t: number) {
    this.value = v;
    this.events.push(['set', v, t]);
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.value = v;
    this.events.push(['linear', v, t]);
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.value = v;
    this.events.push(['exp', v, t]);
    return this;
  }
  setTargetAtTime(v: number, t: number, c: number) {
    this.value = v;
    this.events.push(['target', v, t, c]);
    return this;
  }
}

export class FakeNode {
  connections: FakeNode[] = [];
  disconnected = false;
  constructor(public kind: string) {}
  connect(node: FakeNode) {
    this.connections.push(node);
    return node;
  }
  disconnect() {
    this.disconnected = true;
    this.connections = [];
  }
}

class FakeSource extends FakeNode {
  started: number | null = null;
  stoppedAt: number | null = null;
  onended: (() => void) | null = null;
  buffer: unknown = null;
  loop = false;
  type = 'sine';
  frequency = new FakeParam(440);
  start(t = 0) {
    this.started = t;
  }
  stop(t = 0) {
    this.stoppedAt = t;
  }
  end() {
    this.onended?.();
  }
}

export class FakeAudioContext {
  currentTime = 0;
  sampleRate = 8000;
  state = 'running';
  destination = new FakeNode('destination');
  created: FakeNode[] = [];
  decoded: ArrayBuffer[] = [];
  failDecode = false;

  private track<T extends FakeNode>(node: T): T {
    this.created.push(node);
    return node;
  }
  byKind(kind: string): any[] {
    return this.created.filter((n) => n.kind === kind);
  }
  createGain() {
    return this.track(Object.assign(new FakeNode('gain'), { gain: new FakeParam(1) }));
  }
  createPanner() {
    return this.track(
      Object.assign(new FakeNode('panner'), {
        panningModel: 'equalpower',
        distanceModel: 'inverse',
        refDistance: 1,
        maxDistance: 10000,
        rolloffFactor: 1,
        positionX: new FakeParam(),
        positionY: new FakeParam(),
        positionZ: new FakeParam(),
      }),
    );
  }
  createStereoPanner() {
    return this.track(Object.assign(new FakeNode('stereo'), { pan: new FakeParam() }));
  }
  createConvolver() {
    return this.track(Object.assign(new FakeNode('convolver'), { buffer: null as unknown }));
  }
  createBiquadFilter() {
    return this.track(Object.assign(new FakeNode('biquad'), { type: 'lowpass', frequency: new FakeParam(350) }));
  }
  createBufferSource() {
    return this.track(new FakeSource('buffer'));
  }
  createOscillator() {
    return this.track(new FakeSource('oscillator'));
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, getChannelData: (i: number) => data[i]! };
  }
  async decodeAudioData(data: ArrayBuffer) {
    if (this.failDecode) throw new Error('decode');
    this.decoded.push(data);
    return { duration: 1, length: data.byteLength };
  }
  async resume() {
    this.state = 'running';
  }
  async close() {
    this.state = 'closed';
  }
}

export function fakeContextFactory(ctx = new FakeAudioContext()) {
  return { ctx, factory: () => ctx as unknown as BaseAudioContext };
}
