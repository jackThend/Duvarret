//! Shell nativo de Duvarret (Tauri v2): comandos de proyecto local y base de lore SQLite.

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
fn project_list_assets(root: String) -> Result<Vec<String>, String> {
    project::list_assets(&PathBuf::from(root)).map_err(to_msg)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            project_create,
            project_read,
            project_write_text,
            project_read_text,
            project_list_assets
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar Duvarret");
}
