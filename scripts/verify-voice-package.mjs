/** Verificación funcional del paquete, sin PATH de desarrollo ni PYTHONHOME/PYTHONPATH. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const voice = resolve(process.argv[2] || join(root, 'dist-voice'));
const output = join(root, '.cache/native-build/prueba de voz autónoma con tildes');
mkdirSync(output, { recursive: true });
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(PYTHON|PHONEMIZER|ESPEAK|DUVARRET|CODEX)/i.test(key)));
env.PATH = join(env.SystemRoot || 'C:/Windows', 'System32');
env.PYTHONDONTWRITEBYTECODE = '1';
const python = join(voice, 'python/python.exe');
const plan = { root: output, models: join(voice, 'modelos'), runtime: join(voice, 'runtime'), voice: 'ef_dora', delivery: 'sweet', speed: 0.91, clips: [{ text: 'Lía guardó la última carta. Mañana, a las tres, el mar volverá a contar su historia.', asset: 'narración.wav' }] };
const manifest = JSON.parse(readFileSync(join(voice, 'package.json'), 'utf8'));
for (const file of manifest.files) {
  const path = join(voice, file.path);
  if (!existsSync(path) || createHash('sha256').update(readFileSync(path)).digest('hex') !== file.sha256) throw new Error(`Paquete alterado o incompleto: ${file.path}`);
}
const script = readFileSync(join(voice, 'synthesize-narration.py'), 'utf8');
const started = Date.now();
const run = spawnSync(python, ['-I', '-B', '-X', 'utf8', '-c', script, '--stdin'], { input: JSON.stringify(plan), encoding: 'utf8', env, cwd: output, windowsHide: true, timeout: 180_000 });
if (run.status !== 0) throw new Error(`La síntesis incluida falló: ${run.stderr}\n${run.stdout}`);
const wav = readFileSync(join(output, 'narración.wav'));
if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.length < 48000) throw new Error('No se obtuvo voz WAV válida.');
const infoCode = `
import sys,json,ctypes
from pathlib import Path
sys.path.insert(0,${JSON.stringify(plan.runtime)})
import numpy,onnxruntime,espeakng_loader
lib=ctypes.CDLL(espeakng_loader.get_library_path())
lib.espeak_Info.restype=ctypes.c_char_p
k=ctypes.WinDLL('kernel32',use_last_error=True)
k.GetModuleHandleW.argtypes=[ctypes.c_wchar_p]
k.GetModuleHandleW.restype=ctypes.c_void_p
k.GetModuleFileNameW.argtypes=[ctypes.c_void_p,ctypes.c_wchar_p,ctypes.c_ulong]
loaded={}
for name in ['msvcp140.dll','msvcp140_1.dll','vcruntime140.dll','vcruntime140_1.dll']:
    handle=k.GetModuleHandleW(name)
    if not handle: raise RuntimeError('CRT no cargado: '+name)
    buf=ctypes.create_unicode_buffer(32768)
    k.GetModuleFileNameW(handle,buf,len(buf))
    if not Path(buf.value).resolve().is_relative_to(Path(sys.executable).parent): raise RuntimeError('CRT externo al paquete: '+buf.value)
    loaded[name]=buf.value
print(json.dumps({'executable':sys.executable,'prefix':sys.prefix,'path':sys.path,'espeak':lib.espeak_Info(None).decode(),'wav':'stdlib wave PCM16 little-endian','CRT':loaded}))
`;
const info = spawnSync(python, ['-I', '-B', '-X', 'utf8', '-c', infoCode], { encoding: 'utf8', env, cwd: output, windowsHide: true });
if (info.status !== 0) throw new Error(info.stderr);
const report = `Motor probado: ${voice}\nPATH: ${env.PATH}\nSin variables PYTHONHOME/PYTHONPATH ni carpetas Codex.\nResultado: ${wav.length} bytes WAV, ${(Date.now() - started) / 1000} s\n${info.stdout}\nProgreso: ${run.stdout}\n`;
writeFileSync(join(output, 'VERIFICACION.txt'), report);
console.log(report);
