import { beforeEach, describe, expect, it, vi } from 'vitest';
const bridge = vi.hoisted(() => ({ native: true, invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => bridge.native, invoke: bridge.invoke }));
import { credentialStatus, providerFetch, removeCredential, setCredential, setProviderEndpoint } from './ai';
import { GeminiProvider } from '@/core/agent/providers/gemini';

beforeEach(() => { bridge.native = true; bridge.invoke.mockReset(); localStorage.clear(); });

describe('Transporte y claves de IA', () => {
  it('el escritorio envía claves solo al almacén nativo y no las devuelve al renderer', async () => {
    await setCredential('gemini', ' test-secret ');
    expect(bridge.invoke).toHaveBeenCalledWith('ai_credential_set', { provider: 'gemini', key: 'test-secret' });
    bridge.invoke.mockResolvedValueOnce({ configured: true });
    expect(await credentialStatus('gemini')).toEqual({ configured: true });
    expect(localStorage.length).toBe(0);
    await removeCredential('gemini');
    expect(bridge.invoke).toHaveBeenLastCalledWith('ai_credential_remove', { provider: 'gemini' });
  });
  it('el transporte nativo descarta cabeceras de autenticación entregadas por la vista', async () => {
    bridge.invoke.mockResolvedValue({ status: 200, headers: { 'content-type': 'application/json' }, bodyBase64: btoa('{"ok":true}') });
    const response = await providerFetch('gemini')('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: { authorization: 'Bearer do-not-forward', 'x-goog-api-key': 'do-not-forward', 'content-type': 'application/json' }, body: '{}' });
    expect(await response.json()).toEqual({ ok: true });
    expect(bridge.invoke.mock.calls[0]?.[1]?.request.headers).toEqual({ 'content-type': 'application/json' });
  });
  it('una clave web vive solo en la sesión y nunca se envía a otro origen', async () => {
    bridge.native = false;
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await setCredential('gemini', 'session-secret');
    expect(await credentialStatus('gemini')).toEqual({ configured: true });
    await expect(providerFetch('gemini')('https://otro.example/v1beta/interactions')).rejects.toThrow('proveedor configurado');
    expect(fetcher).not.toHaveBeenCalled();
    await providerFetch('gemini')('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', body: '{}' });
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('error');
    expect(localStorage.length).toBe(0);
    await removeCredential('gemini');
    expect(await credentialStatus('gemini')).toEqual({ configured: false });
    fetcher.mockRestore();
  });
  it('conecta un servidor compatible local sin clave, conservando la restricción loopback', async () => {
    bridge.native = false;
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await setProviderEndpoint('compatible', 'http://localhost:1234/v1');
    await providerFetch('compatible')('http://localhost:1234/v1/chat/completions', { method: 'POST', body: '{}' });
    expect(fetcher).toHaveBeenCalledOnce();
    await expect(setProviderEndpoint('compatible', 'http://192.168.0.2:1234/v1')).rejects.toThrow('HTTPS');
    fetcher.mockRestore();
  });
  it('Gemini de texto usa la clave del vault sin parámetros ni clave en la configuración del renderer', async () => {
    bridge.invoke.mockResolvedValue({ status: 200, headers: { 'content-type': 'application/json' }, bodyBase64: btoa(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Una propuesta.' }] } }] })) });
    const provider = new GeminiProvider({ kind: 'gemini', fetch: providerFetch('gemini') });
    const result = await provider.complete({ messages: [{ role: 'user', content: 'Una propuesta para mi relato.' }], tools: [] });
    expect(result.content).toBe('Una propuesta.');
    const request = bridge.invoke.mock.calls[0]?.[1]?.request;
    expect(request.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect(request.url).not.toContain('?key');
    expect(request.headers).not.toHaveProperty('x-goog-api-key');
    expect(request.provider).toBe('gemini');
  });
});
