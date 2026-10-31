//! Síntesis local: solo escribe WAV, nunca reabre ni sobrescribe el manifiesto en edición.
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};

#[derive(Clone, Deserialize, Serialize)]
pub struct Clip { pub text: String, pub asset: String }
#[derive(Clone, Serialize, Deserialize)]
pub struct Progress { pub completed: usize, pub total: usize }
#[derive(Serialize)]
pub struct GeneratedClip { pub text: String, pub asset: String, pub bytes: u64 }

const REPAIR_VOICE: &str = "La voz incluida está incompleta o dañada. Vuelve a ejecutar el instalador de Duvarret para repararla. Tus obras y grabaciones se conservan.";
const VOICE_FILES: &[&str] = &[
    "package.json", "python/python.exe", "python/python312.dll", "python/python312.zip",
    "python/MSVCP140.dll", "python/MSVCP140_1.dll", "python/VCRUNTIME140.dll", "python/VCRUNTIME140_1.dll",
    "modelos/kokoro-v1.0.onnx", "modelos/voices-v1.0.bin", "runtime/kokoro_onnx/__init__.py",
    "runtime/numpy/__init__.py", "runtime/onnxruntime/__init__.py", "runtime/espeakng_loader/espeak-ng.dll",
    "runtime/espeakng_loader/espeak-ng-data/es_dict", "runtime/espeakng_loader/espeak-ng-data/phondata", "runtime/espeakng_loader/espeak-ng-data/phontab",
];

#[derive(Debug)]
struct BundledVoice { python: PathBuf, models: PathBuf, runtime: PathBuf }

#[derive(Serialize)]
pub struct NarrationStatus { pub ready: bool, pub message: String }

/// Solo recursos del instalador: nunca busca en la obra, PATH, Codex ni variables del proveedor.
fn bundled_voice(resource_dir: &Path) -> Result<BundledVoice, String> {
    let voice = resource_dir.join("voice");
    for relative in VOICE_FILES {
        if !voice.join(relative).metadata().map(|meta| meta.is_file() && meta.len() > 0).unwrap_or(false) {
            return Err(REPAIR_VOICE.into());
        }
    }
    Ok(BundledVoice { python: voice.join("python/python.exe"), models: voice.join("modelos"), runtime: voice.join("runtime") })
}

// API oficial: https://docs.rs/tauri/latest/tauri/path/struct.PathResolver.html#method.resource_dir
fn installed_voice(app: &AppHandle) -> Result<BundledVoice, String> {
    let resources = app.path().resource_dir().map_err(|_| REPAIR_VOICE.to_string())?;
    bundled_voice(&resources)
}

#[tauri::command]
pub fn narration_status(app: AppHandle) -> NarrationStatus {
    match installed_voice(&app) {
        Ok(_) => NarrationStatus { ready: true, message: "Voz local incluida, lista para narrar sin internet.".into() },
        Err(message) => NarrationStatus { ready: false, message },
    }
}

fn voice_command(bundle: &BundledVoice) -> Command {
    let mut command = Command::new(&bundle.python);
    command.args(["-I", "-B", "-X", "utf8", "-c", include_str!("../../scripts/synthesize-narration.py"), "--stdin"])
        .env_remove("PHONEMIZER_ESPEAK_LIBRARY").env_remove("ESPEAK_DATA_PATH")
        .env_remove("DUVARRET_PYTHON").env_remove("DUVARRET_KOKORO_MODELS").env_remove("DUVARRET_KOKORO_RUNTIME")
        .current_dir(bundle.python.parent().expect("ruta fija del motor incluido"))
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    command
}

/// Drena todo stderr para que un diagnóstico grande no bloquee stdout ni el proceso.
fn bounded_stderr(mut reader: impl Read) -> std::io::Result<Vec<u8>> {
    let mut retained = Vec::new();
    let mut chunk = [0_u8; 4096];
    loop {
        let count = reader.read(&mut chunk)?;
        if count == 0 { return Ok(retained); }
        let keep = count.min(8192_usize.saturating_sub(retained.len()));
        retained.extend_from_slice(&chunk[..keep]);
    }
}

fn validate_request(root: &Path, voice: &str, delivery: &str, speed: f64, clips: &[Clip]) -> Result<(), String> {
    if !root.join(crate::project::PROJECT_FILE).is_file() { return Err("Abre una obra guardada en una carpeta antes de actualizar su voz.".into()); }
    if voice.is_empty() || voice.len() > 40 || !voice.bytes().all(|c| c.is_ascii_lowercase() || c == b'_') { return Err("Identificador de voz inválido.".into()); }
    if !["natural", "sweet"].contains(&delivery) || !speed.is_finite() || !(0.7..=1.3).contains(&speed) { return Err("Interpretación de voz inválida.".into()); }
    if delivery == "sweet" && voice != "ef_dora" { return Err("La interpretación dulce está preparada para Dora.".into()); }
    for clip in clips {
        if !clip.asset.starts_with("assets/audio/voz-natural/") || !clip.asset.ends_with(".wav") || clip.text.trim().is_empty() {
            return Err("Plan de grabación inválido.".into());
        }
        crate::project::resolve_inside(root, &clip.asset).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn generate(bundle: BundledVoice, root: String, voice: String, delivery: String, speed: f64, clips: Vec<Clip>, on_progress: Channel<Progress>) -> Result<Vec<GeneratedClip>, String> {
    let root = PathBuf::from(root).canonicalize().map_err(|e| e.to_string())?;
    validate_request(&root, &voice, &delivery, speed, &clips)?;
    if clips.is_empty() { return Ok(Vec::new()); }
    let plan = serde_json::json!({ "root": root, "voice": voice, "delivery": delivery, "speed": speed, "models": bundle.models, "runtime": bundle.runtime, "clips": clips });
    let mut child = voice_command(&bundle).spawn().map_err(|e| format!("{REPAIR_VOICE} No se pudo iniciar la voz: {e}"))?;
    let stderr = child.stderr.take().ok_or("No se pudo leer el diagnóstico de voz.")?;
    let diagnostics = std::thread::spawn(move || bounded_stderr(stderr));
    let input = serde_json::to_vec(&plan).map_err(|e| e.to_string())?;
    if let Err(error) = child.stdin.take().ok_or("No se pudo abrir el plan de voz.")?.write_all(&input) {
        let _ = child.kill(); let _ = child.wait(); let _ = diagnostics.join(); return Err(error.to_string());
    }
    for line in BufReader::new(child.stdout.take().ok_or("No se pudo leer el progreso de voz.")?).lines() {
        match line {
            Ok(line) => if let Ok(progress) = serde_json::from_str::<Progress>(&line) { let _ = on_progress.send(progress); },
            Err(error) => { let _ = child.kill(); let _ = child.wait(); let _ = diagnostics.join(); return Err(format!("Se interrumpió la voz local: {error}")); }
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    let stderr = diagnostics.join().map_err(|_| "No se pudo leer el diagnóstico de voz.")?.map_err(|e| e.to_string())?;
    if !status.success() { return Err(format!("No se pudo generar la voz local. Tus textos y grabaciones anteriores se conservan. {REPAIR_VOICE}\n{}", String::from_utf8_lossy(&stderr))); }
    clips.into_iter().map(|clip| {
        let path = crate::project::resolve_inside(&root, &clip.asset).map_err(|e| e.to_string())?;
        let data = std::fs::read(path).map_err(|e| e.to_string())?;
        if data.len() < 100 || &data[..4] != b"RIFF" { return Err("El modelo no produjo un WAV completo.".into()); }
        Ok(GeneratedClip { text: clip.text, asset: clip.asset, bytes: data.len() as u64 })
    }).collect()
}

#[tauri::command]
pub async fn narration_generate(app: AppHandle, root: String, voice: String, delivery: String, speed: f64, clips: Vec<Clip>, on_progress: Channel<Progress>) -> Result<Vec<GeneratedClip>, String> {
    let bundle = installed_voice(&app)?;
    tauri::async_runtime::spawn_blocking(move || generate(bundle, root, voice, delivery, speed, clips, on_progress)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_only_voice_assets_in_a_saved_work() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(crate::project::PROJECT_FILE), "{}").unwrap();
        let clip = Clip { text: "Una frase.".into(), asset: "assets/audio/voz-natural/ef_dora/test.wav".into() };
        assert!(validate_request(dir.path(), "ef_dora", "sweet", 0.91, std::slice::from_ref(&clip)).is_ok());
        assert!(validate_request(dir.path(), "ef_dora", "sweet", f64::NAN, std::slice::from_ref(&clip)).is_err());
        let escape = Clip { asset: "assets/audio/voz-natural/../../../../fuera.wav".into(), ..clip };
        assert!(validate_request(dir.path(), "ef_dora", "natural", 0.94, &[escape]).is_err());
    }

    fn install_fixture(root: &Path) {
        for relative in VOICE_FILES {
            let file = root.join("voice").join(relative);
            std::fs::create_dir_all(file.parent().unwrap()).unwrap();
            std::fs::write(file, b"fixture").unwrap();
        }
    }

    #[test]
    fn executes_only_the_included_interpreter_with_unicode_and_spaces_without_a_shell() {
        let dir = tempfile::tempdir().unwrap();
        let installed = dir.path().join("Instalación de María");
        install_fixture(&installed);
        let bundle = bundled_voice(&installed).unwrap();
        let command = voice_command(&bundle);
        assert_eq!(Path::new(command.get_program()).canonicalize().unwrap(), installed.join("voice/python/python.exe").canonicalize().unwrap());
        let args: Vec<_> = command.get_args().collect();
        assert_eq!(args[0], "-I");
        assert_eq!(args[1], "-B");
        assert_eq!(args[2], "-X");
        assert_eq!(args[3], "utf8");
        assert_eq!(args.last().unwrap(), &"--stdin");
        assert_eq!(bundle.models, installed.join("voice/modelos"));
        assert_eq!(bundle.runtime, installed.join("voice/runtime"));
    }

    #[test]
    fn missing_or_empty_resources_require_repair_instead_of_external_python_fallback() {
        let dir = tempfile::tempdir().unwrap();
        // Una caché antigua o un Python junto a la app no sustituye el paquete instalado.
        std::fs::create_dir_all(dir.path().join(".cache/voz/runtime/kokoro_onnx")).unwrap();
        std::fs::write(dir.path().join("python.exe"), b"external").unwrap();
        assert_eq!(bundled_voice(dir.path()).unwrap_err(), REPAIR_VOICE);
        install_fixture(dir.path());
        assert!(bundled_voice(dir.path()).is_ok());
        std::fs::write(dir.path().join("voice/modelos/voices-v1.0.bin"), b"").unwrap();
        assert_eq!(bundled_voice(dir.path()).unwrap_err(), REPAIR_VOICE);
        install_fixture(dir.path());
        std::fs::remove_file(dir.path().join("voice/python/python.exe")).unwrap();
        assert!(bundled_voice(dir.path()).is_err());
    }

    #[test]
    fn rejects_invalid_requests_before_starting_a_process() {
        let dir = tempfile::tempdir().unwrap();
        assert!(validate_request(dir.path(), "ef_dora", "natural", 1.0, &[]).is_err());
        std::fs::write(dir.path().join(crate::project::PROJECT_FILE), "{}").unwrap();
        for voice in ["", "python.exe", "EF_DORA", "ef_dora;exit"] {
            assert!(validate_request(dir.path(), voice, "natural", 1.0, &[]).is_err());
        }
        for speed in [f64::INFINITY, 0.69, 1.31] {
            assert!(validate_request(dir.path(), "ef_dora", "natural", speed, &[]).is_err());
        }
        assert!(validate_request(dir.path(), "af_bella", "sweet", 0.91, &[]).is_err());
        assert!(validate_request(dir.path(), "ef_dora", "unknown", 1.0, &[]).is_err());
        for asset in ["../otro.wav", "assets/audio/voz-natural/../../../otro.wav", "assets/audio/voz-natural/otro.exe"] {
            assert!(validate_request(dir.path(), "ef_dora", "natural", 1.0, &[Clip { text: "Hola".into(), asset: asset.into() }]).is_err());
        }
        assert!(validate_request(dir.path(), "ef_dora", "natural", 1.0, &[Clip { text: "   ".into(), asset: "assets/audio/voz-natural/empty.wav".into() }]).is_err());
    }

    #[test]
    fn drains_large_diagnostics_without_retaining_unbounded_output() {
        let mut reader = std::io::Cursor::new(vec![b'x'; 100_000]);
        let diagnostics = bounded_stderr(&mut reader).unwrap();
        assert_eq!(diagnostics.len(), 8192);
        assert_eq!(reader.position(), 100_000);
    }
}
