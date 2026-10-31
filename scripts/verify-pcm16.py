"""Regresión de cuantización: compara wave stdlib con el libsndfile anterior, solo desarrollo."""
import io
from pathlib import Path
import sys
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.cache/voz/runtime'))
import numpy as np
import soundfile as sf

rng = np.random.default_rng(123)
fixture = np.concatenate((np.linspace(-1, 1, 65537, dtype=np.float32), rng.uniform(-.88, .88, 48000).astype(np.float32)))
previous = io.BytesIO()
sf.write(previous, fixture, 24000, format='WAV', subtype='PCM_16')
previous.seek(0)
actual = io.BytesIO()
pcm = np.clip(np.floor(fixture * 32768.0), -32768, 32767).astype('<i2')
with wave.open(actual, 'wb') as recording:
    recording.setnchannels(1)
    recording.setsampwidth(2)
    recording.setframerate(24000)
    recording.writeframes(pcm.tobytes())
actual.seek(0)
with wave.open(previous, 'rb') as old, wave.open(actual, 'rb') as new:
    assert old.getparams() == new.getparams()
    old_samples = np.frombuffer(old.readframes(old.getnframes()), dtype='<i2').astype(np.int32)
    new_samples = np.frombuffer(new.readframes(new.getnframes()), dtype='<i2').astype(np.int32)
    error = np.max(np.abs(old_samples - new_samples))
    assert error <= 1, error
    print(f'PCM16 mono 24000 Hz: {len(new_samples)} muestras, error máximo {error} LSB; duración y formato idénticos.')
