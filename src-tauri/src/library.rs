//! Carpeta personal local. El borrado definitivo solo admite obras creadas aquí.
use std::{fs, path::{Path, PathBuf}};
use tauri::Manager;

#[derive(serde::Serialize)]
pub struct LibraryPaths { pub resources: String, pub works: String }

#[tauri::command]
pub fn studio_library_paths(app: tauri::AppHandle) -> Result<LibraryPaths, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let resources = base.join("biblioteca");
    let works = base.join("obras");
    fs::create_dir_all(resources.join("assets")).map_err(|e| e.to_string())?;
    fs::create_dir_all(&works).map_err(|e| e.to_string())?;
    app.asset_protocol_scope().allow_directory(&resources, true).map_err(|e| e.to_string())?;
    Ok(LibraryPaths { resources: resources.display().to_string(), works: works.display().to_string() })
}

fn managed_work(base: &Path, root: &Path) -> Result<PathBuf, String> {
    let base = base.canonicalize().map_err(|e| e.to_string())?;
    if fs::symlink_metadata(root).map_err(|e| e.to_string())?.file_type().is_symlink() {
        return Err("No se eliminan enlaces a otras carpetas.".into());
    }
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    if root.parent() != Some(base.as_path()) || !root.join(crate::project::PROJECT_FILE).is_file() {
        return Err("Solo se borran definitivamente obras de la carpeta personal de Studio. Las externas conservan sus archivos.".into());
    }
    Ok(root)
}

#[tauri::command]
pub fn studio_delete_managed_work(app: tauri::AppHandle, root: String) -> Result<(), String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?.join("obras");
    let target = managed_work(&base, Path::new(&root))?;
    fs::remove_dir_all(target).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_direct_managed_projects_can_be_deleted() {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("obras");
        let work = base.join("uno.duvarret");
        fs::create_dir_all(&work).unwrap();
        fs::write(work.join(crate::project::PROJECT_FILE), "{}").unwrap();
        assert_eq!(managed_work(&base, &work).unwrap(), work.canonicalize().unwrap());
        assert!(managed_work(&base, &base).is_err());
        assert!(managed_work(&base, temp.path()).is_err());
        let empty = base.join("otra");
        fs::create_dir_all(&empty).unwrap();
        assert!(managed_work(&base, &empty).is_err());
    }
}
