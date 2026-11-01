//! Acceso seguro al sistema de archivos de un proyecto `.duvarret` (offline-first).
//!
//! Todas las rutas relativas se validan para impedir escapar del directorio del proyecto.

use serde::{Deserialize, Serialize};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

/// Subdirectorios canónicos de un proyecto (doc 02 §3).
pub const PROJECT_LAYOUT: &[&str] = &[
    "manuscript/raw",
    "manuscript/beats",
    "knowledge",
    "manifest",
    "assets/audio",
    "assets/images",
    "assets/typography",
    "export",
];

pub const PROJECT_FILE: &str = "project.duvarret.json";
pub const MANIFEST_FILE: &str = "manifest/story_manifest.json";

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProjectBundle {
    pub root: String,
    pub project_json: String,
    pub manifest_json: Option<String>,
}

#[derive(Debug)]
pub enum ProjectError {
    InvalidPath(String),
    Io(std::io::Error),
    NotAProject(String),
    AlreadyExists(String),
}

impl std::fmt::Display for ProjectError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProjectError::InvalidPath(p) => write!(f, "ruta no permitida: {p}"),
            ProjectError::Io(e) => write!(f, "error de disco: {e}"),
            ProjectError::NotAProject(p) => write!(f, "no es un proyecto Duvarret: {p}"),
            ProjectError::AlreadyExists(p) => write!(f, "ya existe una obra en {p}"),
        }
    }
}

impl From<std::io::Error> for ProjectError {
    fn from(e: std::io::Error) -> Self {
        ProjectError::Io(e)
    }
}

/// Resuelve una ruta relativa dentro del proyecto rechazando `..`, rutas absolutas y prefijos.
pub fn resolve_inside(root: &Path, relative: &str) -> Result<PathBuf, ProjectError> {
    let rel = Path::new(relative);
    if relative.is_empty() {
        return Err(ProjectError::InvalidPath(relative.to_string()));
    }
    for component in rel.components() {
        match component {
            Component::Normal(_) | Component::CurDir => {}
            _ => return Err(ProjectError::InvalidPath(relative.to_string())),
        }
    }
    Ok(root.join(rel))
}

/// Crea la estructura de carpetas de un proyecto nuevo con su archivo de metadatos.
pub fn create_project(root: &Path, project_json: &str) -> Result<(), ProjectError> {
    serde_json::from_str::<serde_json::Value>(project_json)
        .map_err(|e| ProjectError::InvalidPath(format!("metadatos inválidos: {e}")))?;
    // Nunca se sobrescribe una obra existente.
    if root.join(PROJECT_FILE).exists() {
        return Err(ProjectError::AlreadyExists(root.display().to_string()));
    }
    for dir in PROJECT_LAYOUT {
        fs::create_dir_all(root.join(dir))?;
    }
    fs::write(root.join(PROJECT_FILE), project_json)?;
    Ok(())
}

pub fn read_project(root: &Path) -> Result<ProjectBundle, ProjectError> {
    let project_path = root.join(PROJECT_FILE);
    if !project_path.is_file() {
        return Err(ProjectError::NotAProject(root.display().to_string()));
    }
    let project_json = fs::read_to_string(project_path)?;
    let manifest_path = root.join(MANIFEST_FILE);
    let manifest_json = if manifest_path.is_file() {
        Some(fs::read_to_string(manifest_path)?)
    } else {
        None
    };
    Ok(ProjectBundle {
        root: root.display().to_string(),
        project_json,
        manifest_json,
    })
}

/// Escribe un archivo de texto dentro del proyecto de forma atómica (tmp + rename).
pub fn write_text(root: &Path, relative: &str, contents: &str) -> Result<(), ProjectError> {
    let target = resolve_inside(root, relative)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = target.with_extension("tmp-duvarret");
    fs::write(&tmp, contents)?;
    fs::rename(&tmp, &target)?;
    Ok(())
}

/// Escribe datos binarios (p. ej. `knowledge/lore_graph.db`) de forma atómica.
pub fn write_bytes(root: &Path, relative: &str, contents: &[u8]) -> Result<(), ProjectError> {
    let target = resolve_inside(root, relative)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = target.with_extension("tmp-duvarret");
    fs::write(&tmp, contents)?;
    fs::rename(&tmp, &target)?;
    Ok(())
}

pub fn read_bytes(root: &Path, relative: &str) -> Result<Vec<u8>, ProjectError> {
    let target = resolve_inside(root, relative)?;
    Ok(fs::read(target)?)
}

const MAX_CHUNK_BYTES: usize = 256 * 1024;
const MAX_TRANSFER_BYTES: u64 = 512 * 1024 * 1024;

/// Recibe partes secuenciales; conserva el destino hasta publicar la última con rename.
/// Una transferencia por ruta: el cliente mantiene el mismo total y espera cada llamada.
pub fn write_bytes_chunk(
    root: &Path,
    relative: &str,
    encoded: &str,
    offset: u64,
    total: u64,
) -> Result<(), ProjectError> {
    let target = resolve_inside(root, relative)?;
    let temporary = resolve_inside(root, &format!("{relative}.part"))?;
    let invalid = |message: &str| ProjectError::Io(std::io::Error::new(
        std::io::ErrorKind::InvalidInput, message,
    ));
    if total > MAX_TRANSFER_BYTES || offset > total {
        return Err(invalid("total u offset fuera del límite permitido"));
    }
    // Limita también la asignación antes de decodificar el mensaje IPC.
    if encoded.len() > MAX_CHUNK_BYTES.div_ceil(3) * 4 {
        return Err(invalid("parte base64 demasiado grande"));
    }
    let bytes = STANDARD.decode(encoded)
        .map_err(|_| invalid("base64 inválido"))?;
    if bytes.len() > MAX_CHUNK_BYTES {
        return Err(invalid("la parte supera 256 KiB"));
    }
    let end = offset.checked_add(bytes.len() as u64)
        .filter(|end| *end <= total)
        .ok_or_else(|| invalid("la parte excede el total declarado"))?;
    if bytes.is_empty() && total != 0 {
        return Err(invalid("parte vacía en una transferencia no vacía"));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut options = fs::OpenOptions::new();
    options.write(true);
    if offset == 0 {
        options.create(true).truncate(true);
    } else {
        options.append(true);
    }
    let mut file = options.open(&temporary)?;
    if offset > 0 && file.metadata()?.len() != offset {
        return Err(invalid("offset distinto de la longitud de la parte temporal"));
    }
    file.write_all(&bytes)?;
    if end == total {
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, &target)?;
    }
    Ok(())
}

/// Retira un recurso aportado por la autora. Solo se permite dentro de `assets/`
/// y nunca sobre el catálogo de procedencia.
pub fn delete_asset(root: &Path, relative: &str) -> Result<(), ProjectError> {
    let normalized = relative.replace('\\', "/");
    if !normalized.starts_with("assets/") || normalized == "assets/registry.json" {
        return Err(ProjectError::InvalidPath(relative.to_string()));
    }
    let target = resolve_inside(root, relative)?;
    if target.is_file() {
        fs::remove_file(target)?;
    }
    Ok(())
}

pub fn read_text(root: &Path, relative: &str) -> Result<String, ProjectError> {
    let target = resolve_inside(root, relative)?;
    Ok(fs::read_to_string(target)?)
}

/// Lista recursivamente los assets del proyecto (rutas relativas con `/`).
pub fn list_assets(root: &Path) -> Result<Vec<String>, ProjectError> {
    let base = root.join("assets");
    let mut out = Vec::new();
    if base.is_dir() {
        walk(&base, root, &mut out)?;
    }
    out.sort();
    Ok(out)
}

fn walk(dir: &Path, root: &Path, out: &mut Vec<String>) -> Result<(), ProjectError> {
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            walk(&path, root, out)?;
        } else if let Ok(rel) = path.strip_prefix(root) {
            out.push(
                rel.components()
                    .map(|c| c.as_os_str().to_string_lossy().into_owned())
                    .collect::<Vec<_>>()
                    .join("/"),
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunked_write_preserves_destination_until_completion() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("export/obra.bin");
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(&target, b"anterior").unwrap();
        write_bytes_chunk(dir.path(), "export/obra.bin", &STANDARD.encode(b"hola"), 0, 9).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"anterior");
        assert_eq!(fs::read(dir.path().join("export/obra.bin.part")).unwrap(), b"hola");
        write_bytes_chunk(dir.path(), "export/obra.bin", &STANDARD.encode(b"mundo"), 4, 9).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"holamundo");
        assert!(!dir.path().join("export/obra.bin.part").exists());
    }

    #[test]
    fn chunked_write_rejects_wrong_offsets_without_changing_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("destino"), b"original").unwrap();
        write_bytes_chunk(dir.path(), "destino", &STANDARD.encode(b"ab"), 0, 4).unwrap();
        for offset in [1, 3, 5, u64::MAX] {
            assert!(write_bytes_chunk(dir.path(), "destino", "Yw==", offset, 4).is_err());
            assert_eq!(fs::read(dir.path().join("destino")).unwrap(), b"original");
            assert_eq!(fs::read(dir.path().join("destino.part")).unwrap(), b"ab");
        }
    }

    #[test]
    fn chunked_write_rejects_traversal() {
        let dir = tempfile::tempdir().unwrap();
        for relative in ["../fuera", "assets/../../fuera", "/fuera", ""] {
            assert!(write_bytes_chunk(dir.path(), relative, "YQ==", 0, 1).is_err());
        }
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[test]
    fn chunked_write_validates_base64_and_limits_before_truncating() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("destino"), b"original").unwrap();
        fs::write(dir.path().join("destino.part"), b"parcial").unwrap();
        let oversized = STANDARD.encode(vec![0; MAX_CHUNK_BYTES + 1]);
        for (encoded, total) in [
            ("%%%", 3), ("YQ", 1), (oversized.as_str(), MAX_TRANSFER_BYTES),
            ("YQ==", MAX_TRANSFER_BYTES + 1), ("YWI=", 1), ("", 1),
        ] {
            assert!(write_bytes_chunk(dir.path(), "destino", encoded, 0, total).is_err());
            assert_eq!(fs::read(dir.path().join("destino")).unwrap(), b"original");
            assert_eq!(fs::read(dir.path().join("destino.part")).unwrap(), b"parcial");
        }
        let maximum = vec![7; MAX_CHUNK_BYTES];
        write_bytes_chunk(dir.path(), "destino", &STANDARD.encode(&maximum), 0, MAX_CHUNK_BYTES as u64).unwrap();
        assert_eq!(fs::read(dir.path().join("destino")).unwrap(), maximum);
        write_bytes_chunk(dir.path(), "vacio", "", 0, 0).unwrap();
        assert_eq!(fs::metadata(dir.path().join("vacio")).unwrap().len(), 0);
    }

    #[test]
    fn rejects_traversal_and_absolute_paths() {
        let root = Path::new("/tmp/obra.duvarret");
        assert!(resolve_inside(root, "../etc/passwd").is_err());
        assert!(resolve_inside(root, "/etc/passwd").is_err());
        assert!(resolve_inside(root, "assets/../../x").is_err());
        assert!(resolve_inside(root, "").is_err());
        assert_eq!(
            resolve_inside(root, "manifest/story_manifest.json").unwrap(),
            root.join("manifest/story_manifest.json")
        );
    }

    #[test]
    fn creates_reads_and_writes_project() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("Mi_Novela.duvarret");
        create_project(&root, r#"{"title":"Mi Novela"}"#).unwrap();
        for sub in PROJECT_LAYOUT {
            assert!(root.join(sub).is_dir(), "falta {sub}");
        }
        let bundle = read_project(&root).unwrap();
        assert!(bundle.manifest_json.is_none());

        write_text(&root, MANIFEST_FILE, r#"{"nodes":[]}"#).unwrap();
        let bundle = read_project(&root).unwrap();
        assert_eq!(bundle.manifest_json.as_deref(), Some(r#"{"nodes":[]}"#));
        assert_eq!(read_text(&root, MANIFEST_FILE).unwrap(), r#"{"nodes":[]}"#);

        write_bytes(&root, "knowledge/lore_graph.db", &[0x53, 0x51, 0x4c]).unwrap();
        assert_eq!(read_bytes(&root, "knowledge/lore_graph.db").unwrap(), vec![0x53, 0x51, 0x4c]);
        assert!(write_bytes(&root, "../fuera.db", &[1]).is_err());

        write_text(&root, "assets/audio/registry.json", "{}").unwrap();
        assert_eq!(list_assets(&root).unwrap(), vec!["assets/audio/registry.json"]);
    }

    #[test]
    fn deletes_only_assets() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("Obra.duvarret");
        create_project(&root, "{}").unwrap();
        write_bytes(&root, "assets/audio/gotera.wav", b"RIFF").unwrap();
        write_text(&root, "assets/registry.json", "{}").unwrap();
        delete_asset(&root, "assets/audio/gotera.wav").unwrap();
        assert!(!root.join("assets/audio/gotera.wav").exists());
        assert!(delete_asset(&root, "assets/audio/ya-no-existe.wav").is_ok());
        assert!(delete_asset(&root, "assets/registry.json").is_err());
        assert!(delete_asset(&root, "project.duvarret.json").is_err());
        assert!(delete_asset(&root, "assets/../project.duvarret.json").is_err());
        assert!(root.join(PROJECT_FILE).exists());
    }

    #[test]
    fn never_overwrites_an_existing_project() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("Obra.duvarret");
        create_project(&root, r#"{"title":"Original"}"#).unwrap();
        assert!(matches!(create_project(&root, r#"{"title":"Otra"}"#), Err(ProjectError::AlreadyExists(_))));
        assert_eq!(read_project(&root).unwrap().project_json, r#"{"title":"Original"}"#);
    }

    #[test]
    fn rejects_invalid_metadata_and_missing_project() {
        let dir = tempfile::tempdir().unwrap();
        assert!(create_project(dir.path(), "no es json").is_err());
        assert!(matches!(read_project(dir.path()), Err(ProjectError::NotAProject(_))));
    }
}
