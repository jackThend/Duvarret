import type { FetchLike } from '../agent/types';

export type AiProviderId = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'zen' | 'compatible' | 'elevenlabs' | 'cloudflare' | 'freesound';
export type ImageProvider = 'gemini' | 'cloudflare';
export type SpeechProvider = 'gemini' | 'elevenlabs' | 'compatible' | 'openai';
export interface GeneratedMedia { data: Uint8Array; mimeType: string; provider: AiProviderId; model: string }
export interface ImageGenerationRequest { provider: ImageProvider; model: string; prompt: string; accountId?: string; aspectRatio?: string; signal?: AbortSignal }
export interface SpeechGenerationRequest { provider: SpeechProvider; model: string; voice: string; text: string; speed?: number; style?: string; baseUrl?: string; signal?: AbortSignal }
export interface SoundEffectRequest { text: string; durationSeconds?: number; signal?: AbortSignal }
export type AiTransport = (provider: AiProviderId) => FetchLike;
export interface ModelOption { id: string; label: string }
