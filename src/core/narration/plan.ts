/** Plan compartido por Studio y CLI; no escribe archivos ni cambia el texto del autor. */
import { ManifestEditor } from '../agent/manifestEditor';
import type { StoryManifest } from '../manifest';
import { speechKey, speechTexts } from './script';

export type Delivery = 'natural' | 'sweet';
export interface NarrationSelection {
  provider: 'kokoro' | 'gemini' | 'elevenlabs' | 'compatible' | 'openai';
  model?: string;
  voice?: string;
  speed?: number;
}
export interface NarrationPlan {
  voice: string;
  voiceId: string;
  label: string;
  delivery: Delivery;
  speed: number;
  clips: { text: string; asset: string }[];
  pending: { text: string; asset: string }[];
  provider?: NarrationSelection['provider'];
  model?: string;
}

export async function planNarration(manifest: StoryManifest, exists: (path: string) => boolean | Promise<boolean>, delivery?: Delivery, selection?: NarrationSelection): Promise<NarrationPlan> {
  const previous = manifest.global_settings.narration_voice;
  const provider = selection?.provider ?? previous?.provider ?? 'kokoro';
  const local = provider === 'kokoro';
  const sameProvider = provider === (previous?.provider ?? 'kokoro');
  const model = local ? undefined : selection?.model?.trim() ?? (sameProvider ? previous?.model : undefined);
  const voice = selection?.voice?.trim() ?? (sameProvider ? previous?.voice : undefined) ?? (local ? previous?.voice_id?.startsWith('kokoro:') ? previous.voice_id.slice('kokoro:'.length) : 'ef_dora' : '');
  const voiceId = local ? `kokoro:${voice}` : `${provider}:${model}:${voice}`;
  if (local && !/^kokoro:[a-z]{2}_[a-z]+$/.test(voiceId)) throw new Error('Elige una voz Kokoro válida.');
  if (!local && (!model || !voice)) throw new Error('Elige el modelo y la voz del servicio antes de narrar.');
  const chosen = local ? delivery ?? previous?.delivery ?? 'natural' : 'natural';
  if (local && chosen === 'sweet' && voice !== 'ef_dora') throw new Error('La interpretación dulce está disponible para Dora.');
  const speed = selection?.speed ?? (local ? chosen !== (previous?.delivery ?? 'natural') ? (chosen === 'sweet' ? 0.91 : 0.94) : previous?.speed ?? 0.94 : previous?.provider === provider ? previous?.speed ?? 1 : 1);
  const compatible = voiceId === previous?.voice_id && chosen === (previous?.delivery ?? 'natural') && speed === (previous?.speed ?? 0.94);
  const known = new Map(compatible ? previous?.clips.map(clip => [speechKey(clip.text), clip.asset]) : []);
  const clips = await Promise.all(speechTexts(manifest).map(async text => {
    const key = speechKey(text);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${voiceId}\0${chosen}\0${speed}\0v2\0${key}`));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 24);
    const candidate = known.get(key);
    const folder = local ? voice : `${provider}/${voice.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)}`;
    const asset = candidate && await exists(candidate) ? candidate : `assets/audio/voz-natural/${folder}/${hash}.${provider === 'elevenlabs' ? 'mp3' : 'wav'}`;
    return { text, asset };
  }));
  const states = await Promise.all(clips.map(clip => exists(clip.asset)));
  return { voice, voiceId, provider, ...(model ? { model } : {}), delivery: chosen, speed, label: local ? `${voice === 'ef_dora' ? 'Dora' : voice}${chosen === 'sweet' ? ' dulce' : ''} · español · Kokoro` : `${voice} · ${provider} · ${model}`, clips, pending: clips.filter((_, i) => !states[i]) };
}

/** Aplica grabaciones al manifiesto actual: nunca restaura la instantánea previa a la síntesis. */
export function applyNarration(manifest: StoryManifest, plan: NarrationPlan): StoryManifest {
  const texts = new Set(speechTexts(manifest).map(speechKey));
  const clips = plan.clips.filter(clip => texts.has(speechKey(clip.text)));
  const editor = new ManifestEditor(manifest);
  editor.patchManifest({ global_settings: { narration_voice: { voice_id: plan.voiceId, label: plan.label, provider: plan.provider ?? 'kokoro', model: plan.model, voice: plan.voice, delivery: plan.delivery, speed: plan.speed, clips } } });
  for (const node of manifest.nodes) {
    const clip = clips.find(clip => speechKey(clip.text) === speechKey(node.screenless_mode?.narration_text ?? node.text_payload));
    editor.patchNode(node.node_id, { screenless_mode: { voice_over_asset: clip?.asset } });
  }
  return editor.current;
}
