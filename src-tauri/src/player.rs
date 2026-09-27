//! Modo reproductor portátil: sirve una obra desde la carpeta `obra/` situada junto al
//! ejecutable mediante el protocolo `obra://`, sin recompilar el runtime.

use crate::project::resolve_inside;
use std::path::{Path, PathBuf};

pub const OBRA_DIR: &str = "obra";

/// Carpeta de la obra junto al ejecutable (o `DUVARRET_OBRA` si se define).
pub fn obra_root() -> Option<PathBuf> {
    if let Ok(custom) = std::env::var("DUVARRET_OBRA") {
        return Some(PathBuf::from(custom));
    }
    let exe = std::env::current_exe().ok()?;
    Some(exe.parent()?.join(OBRA_DIR))
}

pub fn mime_for(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
        "json" | "webmanifest" => "application/json",
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript",
        "css" => "text/css",
        "ogg" | "opus" => "audio/ogg",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "webp" => "image/webp",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "woff2" => "font/woff2",
        "wasm" => "application/wasm",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

/// Resuelve y lee un archivo de la obra. Devuelve (estado HTTP, tipo MIME, contenido).
pub fn serve(root: &Path, uri_path: &str) -> (u16, &'static str, Vec<u8>) {
    let relative = uri_path.trim_start_matches('/');
    let relative = relative.split(['?', '#']).next().unwrap_or("");
    let decoded = percent_decode(relative);
    match resolve_inside(root, &decoded) {
        Ok(path) if path.is_file() => match std::fs::read(&path) {
            Ok(bytes) => (200, mime_for(&decoded), bytes),
            Err(_) => (500, "text/plain", Vec::new()),
        },
        Ok(_) => (404, "text/plain", Vec::new()),
        Err(_) => (403, "text/plain", Vec::new()),
    }
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serves_files_safely() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("manifest")).unwrap();
        std::fs::write(dir.path().join("manifest/story_manifest.json"), b"{}").unwrap();
        std::fs::write(dir.path().join("mi audio.ogg"), b"OggS").unwrap();

        let (status, mime, body) = serve(dir.path(), "/manifest/story_manifest.json?v=1");
        assert_eq!((status, mime, body.as_slice()), (200, "application/json", b"{}".as_slice()));
        assert_eq!(serve(dir.path(), "/mi%20audio.ogg").0, 200);
        assert_eq!(serve(dir.path(), "/nada.json").0, 404);
        assert_eq!(serve(dir.path(), "/../secreto").0, 403);
        assert_eq!(serve(dir.path(), "/%2e%2e/secreto").0, 403);
        assert_eq!(mime_for("a.WAV"), "audio/wav");
    }
}
