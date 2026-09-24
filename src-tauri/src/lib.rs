//! Shell nativo de Duvarret (Tauri v2): comandos de proyecto local y base de lore SQLite.

pub mod player;
pub mod project;

use std::path::PathBuf;

fn to_msg(e: project::ProjectError) -> String {
    e.to_string()
}

#[tauri::command]
fn project_create(root: String, project_json: String) -> Result<(), String> {
    project::create_project(&PathBuf::from(root), &project_json).map_err(to_msg)
}

#[tauri::command]
fn project_read(root: String) -> Result<project::ProjectBundle, String> {
    project::read_project(&PathBuf::from(root)).map_err(to_msg)
}

#[tauri::command]
fn project_write_text(root: String, relative: String, contents: String) -> Result<(), String> {
    project::write_text(&PathBuf::from(root), &relative, &contents).map_err(to_msg)
}

#[tauri::command]
fn project_read_text(root: String, relative: String) -> Result<String, String> {
    project::read_text(&PathBuf::from(root), &relative).map_err(to_msg)
}

#[tauri::command]
fn project_write_bytes(root: String, relative: String, contents: Vec<u8>) -> Result<(), String> {
    project::write_bytes(&PathBuf::from(root), &relative, &contents).map_err(to_msg)
}

#[tauri::command]
fn project_read_bytes(root: String, relative: String) -> Result<Vec<u8>, String> {
    project::read_bytes(&PathBuf::from(root), &relative).map_err(to_msg)
}

#[tauri::command]
fn project_list_assets(root: String) -> Result<Vec<String>, String> {
    project::list_assets(&PathBuf::from(root)).map_err(to_msg)
}

/// Copia el reproductor de escritorio (recurso del Studio) junto a la carpeta `obra/` exportada.
#[tauri::command]
fn export_player_binary(app: tauri::AppHandle, root: String, relative_dir: String, name: String) -> Result<String, String> {
    use tauri::Manager;
    let exe_name = if cfg!(windows) { "duvarret-player.exe" } else { "duvarret-player" };
    let source = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("player")
        .join(exe_name);
    if !source.is_file() {
        return Err("Esta instalación no incluye el reproductor de escritorio.".into());
    }
    let safe_name: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    let file = if cfg!(windows) { format!("{safe_name}.exe") } else { safe_name };
    let dir = project::resolve_inside(&PathBuf::from(&root), &relative_dir).map_err(to_msg)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = dir.join(file);
    std::fs::copy(&source, &target).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o755));
    }
    Ok(target.display().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .register_uri_scheme_protocol("obra", |_ctx, request| {
            let (status, mime, body) = match player::obra_root() {
                Some(root) => player::serve(&root, request.uri().path()),
                None => (404, "text/plain", Vec::new()),
            };
            tauri::http::Response::builder()
                .status(status)
                .header("Content-Type", mime)
                .header("Access-Control-Allow-Origin", "*")
                .body(body)
                .expect("respuesta del protocolo obra")
        })
        .invoke_handler(tauri::generate_handler![
            project_create,
            project_read,
            project_write_text,
            project_read_text,
            project_write_bytes,
            project_read_bytes,
            project_list_assets,
            export_player_binary
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar Duvarret");
}
