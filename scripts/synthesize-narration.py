"""Síntesis Kokoro local. No contiene llamadas de red. Los pesos se preparan por separado."""
import argparse
import json
import os
from pathlib import Path
import re
import sys
import wave

parser = argparse.ArgumentParser()
parser.add_argument("--plan")
parser.add_argument("--stdin", action="store_true")
args = parser.parse_args()
plan = json.load(sys.stdin) if args.stdin else json.loads(Path(args.plan).read_text(encoding="utf-8"))
runtime = Path(plan["runtime"]).resolve()
models = Path(plan["models"]).resolve()
root = Path(plan["root"]).resolve()
sys.path.insert(0, str(runtime))
# eSpeak usa rutas estrechas de C en Windows. El adaptador incluido le pasa
# espeak-ng-data relativo a este directorio, sin perder tildes en su prefijo.
# Solo cambia el directorio del proceso de síntesis; Python resuelve el resto
# de rutas absolutas mediante las APIs Unicode de Windows.
if sys.platform == "win32":
    os.chdir(runtime / "espeakng_loader")
for key in ("PHONEMIZER_ESPEAK_LIBRARY", "PHONEMIZER_ESPEAK_DATA_PATH", "ESPEAK_DATA_PATH"):
    os.environ.pop(key, None)
import numpy as np
import onnxruntime as ort
from kokoro_onnx import Kokoro

options = ort.SessionOptions()
options.intra_op_num_threads = 4
options.inter_op_num_threads = 1
session = ort.InferenceSession(str(models / "kokoro-v1.0.onnx"), sess_options=options, providers=["CPUExecutionProvider"])
kokoro = Kokoro.from_session(session, str(models / "voices-v1.0.bin"))
voice = plan["voice"]
if voice not in kokoro.voices:
    raise RuntimeError(f"Voz no incluida en el modelo: {voice}")
if plan.get("delivery") == "sweet":
    if voice != "ef_dora":
        raise RuntimeError("La interpretación dulce está preparada para Dora.")
    # Mezcla de timbres del modelo, sin clonar personas; conserva fonemas españoles.
    voice = kokoro.voices["ef_dora"] * 0.75 + kokoro.voices["af_bella"] * 0.25
speed = plan.get("speed", 0.94)
for index, clip in enumerate(plan["clips"]):
    path = (root / clip["asset"]).resolve()
    if not path.is_relative_to(root):
        raise RuntimeError("La salida debe pertenecer a la obra.")
    text = clip["text"].replace("A las 00:00", "A medianoche").replace("—", "")
    text = re.sub(r"^I ·", "Uno.", text)
    text = re.sub(r"^II ·", "Dos.", text)
    text = re.sub(r"^III ·", "Tres.", text)
    text = re.sub(r"^([12]):", lambda m: "Opción " + ("uno" if m[1] == "1" else "dos") + ".", text)
    parts = [np.zeros(4800, dtype=np.float32)]
    for paragraph in text.split("\n\n"):
        if not paragraph.strip():
            continue
        if paragraph.isupper():
            paragraph = paragraph.capitalize()
        samples, rate = kokoro.create(paragraph.replace("\n", ". "), voice=voice, speed=speed, lang="es")
        parts.extend([samples, np.zeros(int(rate * 0.42), dtype=np.float32)])
    audio = np.concatenate(parts)
    peak = np.max(np.abs(audio))
    if not peak or not np.isfinite(audio).all():
        raise RuntimeError("El modelo no produjo una grabación válida.")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".partial.wav")
    # PCM16 equivalente a libsndfile: cuantización hacia abajo, sin codecs externos.
    pcm = np.clip(np.floor(audio * (0.88 / peak) * 32768.0), -32768, 32767).astype("<i2")
    with wave.open(str(temporary), "wb") as recording:
        recording.setnchannels(1)
        recording.setsampwidth(2)
        recording.setframerate(rate)
        recording.writeframes(pcm.tobytes())
    temporary.replace(path)
    print(json.dumps({"completed": index + 1, "total": len(plan["clips"])}), flush=True)
