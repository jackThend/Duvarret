//! Credenciales del usuario cifradas con DPAPI y transporte HTTP con destino restringido.
//! Nunca se serializan claves hacia la vista ni se guardan en obras o preferencias web.
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{header::{HeaderMap, HeaderName, HeaderValue}, Url};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::{Path, PathBuf}, sync::Mutex, time::Duration};
use tauri::{AppHandle, Manager};

static VAULT_LOCK: Mutex<()> = Mutex::new(());
const MAX_RESPONSE: usize = 64 * 1024 * 1024;
const MAX_REQUEST: usize = 4 * 1024 * 1024;

fn provider_id(provider: &str) -> Result<(), String> {
    if ["openai", "anthropic", "gemini", "ollama", "zen", "compatible", "elevenlabs", "cloudflare"].contains(&provider) { Ok(()) }
    else { Err("Proveedor de IA desconocido.".into()) }
}
fn app_config(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map(|path| path.join("ai")).map_err(|_| "No se pudo abrir la configuración privada de IA.".into())
}
fn key_file(config: &Path, provider: &str) -> Result<PathBuf, String> {
    provider_id(provider)?;
    Ok(config.join("credentials").join(format!("{provider}.bin")))
}

// DPAPI por usuario, sin CRYPTPROTECT_LOCAL_MACHINE. La memoria de salida se libera
// con LocalFree según https://learn.microsoft.com/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata
// y https://learn.microsoft.com/windows/win32/api/dpapi/nf-dpapi-cryptunprotectdata
#[cfg(windows)]
fn crypt(data: &[u8], protect: bool) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::{Foundation::LocalFree, Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN}};
    let input = CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 };
    let mut output = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
    let success = unsafe {
        if protect { CryptProtectData(&input, std::ptr::null(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output) }
        else { CryptUnprotectData(&input, std::ptr::null_mut(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output) }
    };
    if success == 0 { return Err("Windows no pudo abrir el almacén privado de claves. Vuelve a guardar tu clave en Ajustes.".into()); }
    let bytes = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe { LocalFree(output.pbData.cast()); }
    Ok(bytes)
}
#[cfg(not(windows))]
fn crypt(_data: &[u8], _protect: bool) -> Result<Vec<u8>, String> {
    Err("El almacén protegido de esta versión está disponible en Windows. No se guardó ninguna clave sin cifrar.".into())
}

fn read_key(config: &Path, provider: &str) -> Result<Option<String>, String> {
    let file = key_file(config, provider)?;
    let encrypted = match std::fs::read(file) { Ok(data) => data, Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None), Err(_) => return Err("No se pudo leer la clave protegida.".into()) };
    let plain = crypt(&encrypted, false)?;
    String::from_utf8(plain).map(Some).map_err(|_| "La clave protegida está dañada; vuelve a guardarla.".into())
}

#[derive(Serialize)]
pub struct CredentialStatus { configured: bool }
#[tauri::command]
pub fn ai_credential_status(app: AppHandle, provider: String) -> Result<CredentialStatus, String> {
    let _guard = VAULT_LOCK.lock().map_err(|_| "No se pudo abrir el almacén de claves.")?;
    Ok(CredentialStatus { configured: read_key(&app_config(&app)?, &provider)?.is_some() })
}
#[tauri::command]
pub fn ai_credential_set(app: AppHandle, provider: String, key: String) -> Result<(), String> {
    if key.trim().is_empty() || key.len() > 8192 || key.chars().any(char::is_control) { return Err("Introduce una clave válida.".into()); }
    let _guard = VAULT_LOCK.lock().map_err(|_| "No se pudo abrir el almacén de claves.")?;
    let path = key_file(&app_config(&app)?, &provider)?;
    let encrypted = crypt(key.trim().as_bytes(), true)?;
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|_| "No se pudo crear el almacén privado de claves.")?;
    let temporary = path.with_extension("partial");
    std::fs::write(&temporary, encrypted).map_err(|_| "No se pudo guardar la clave protegida.")?;
    std::fs::rename(temporary, path).map_err(|_| "No se pudo terminar de guardar la clave protegida.".into())
}
#[tauri::command]
pub fn ai_credential_remove(app: AppHandle, provider: String) -> Result<(), String> {
    let _guard = VAULT_LOCK.lock().map_err(|_| "No se pudo abrir el almacén de claves.")?;
    match std::fs::remove_file(key_file(&app_config(&app)?, &provider)?) {
        Ok(()) => Ok(()), Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()), Err(_) => Err("No se pudo eliminar la clave protegida.".into()),
    }
}

#[tauri::command]
pub fn ai_open_provider_docs(provider: String) -> Result<(), String> {
    let url = match provider.as_str() {
        "gemini" => "https://aistudio.google.com/apikey",
        "cloudflare" => "https://dash.cloudflare.com/profile/api-tokens",
        "elevenlabs" => "https://elevenlabs.io/docs/eleven-api/quickstart",
        "openai" => "https://platform.openai.com/api-keys",
        "anthropic" => "https://console.anthropic.com/settings/keys",
        "zen" => "https://opencode.ai/auth", "ollama" => "https://ollama.com/",
        "compatible" => "https://openrouter.ai/settings/keys", _ => return Err("Proveedor de IA desconocido.".into()),
    };
    let program = if cfg!(windows) { "explorer.exe" } else if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    let mut command = std::process::Command::new(program);
    command.arg(url);
    #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
    command.spawn().map_err(|_| "No se pudo abrir el navegador. Copia el enlace del proveedor y ábrelo manualmente.".to_string())?;
    Ok(())
}

fn default_endpoint(provider: &str) -> Option<&'static str> {
    match provider {
        "openai" => Some("https://api.openai.com/v1"), "anthropic" => Some("https://api.anthropic.com/v1"),
        "gemini" => Some("https://generativelanguage.googleapis.com/v1beta"), "elevenlabs" => Some("https://api.elevenlabs.io/v1"),
        "cloudflare" => Some("https://api.cloudflare.com/client/v4/accounts"),
        "zen" => Some("https://opencode.ai/inference/openai/v1"), "ollama" => Some("http://localhost:11434"), _ => None,
    }
}
fn endpoint_file(config: &Path, provider: &str) -> Result<PathBuf, String> {
    if !["compatible", "ollama"].contains(&provider) { return Err("Este proveedor utiliza su dirección oficial.".into()); }
    Ok(config.join(format!("endpoint-{provider}.txt")))
}
fn validate_endpoint(provider: &str, raw: &str) -> Result<Url, String> {
    provider_id(provider)?;
    let url = Url::parse(raw).map_err(|_| "La dirección del proveedor no es válida.")?;
    let loopback = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]" | "::1"));
    if url.scheme() != "https" && !(["ollama", "compatible"].contains(&provider) && url.scheme() == "http" && loopback) { return Err("Usa HTTPS; los modelos locales pueden usar HTTP únicamente en este equipo.".into()); }
    if !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() { return Err("La dirección no debe incluir claves, credenciales ni parámetros.".into()); }
    Ok(url)
}
#[tauri::command]
pub fn ai_endpoint_set(app: AppHandle, provider: String, url: String) -> Result<(), String> {
    let config = app_config(&app)?;
    let file = endpoint_file(&config, &provider)?;
    let url = validate_endpoint(&provider, &url)?;
    std::fs::create_dir_all(&config).map_err(|_| "No se pudo guardar la dirección del proveedor.")?;
    std::fs::write(file, url.as_str()).map_err(|_| "No se pudo guardar la dirección del proveedor.".into())
}
fn configured_endpoint(config: &Path, provider: &str) -> Result<Url, String> {
    let custom = if ["compatible", "ollama"].contains(&provider) {
        match std::fs::read_to_string(endpoint_file(config, provider)?) { Ok(raw) => Some(raw), Err(error) if error.kind() == std::io::ErrorKind::NotFound => None, Err(_) => return Err("No se pudo leer la dirección del proveedor.".into()) }
    } else { None };
    validate_endpoint(provider, custom.as_deref().or_else(|| default_endpoint(provider)).ok_or("Configura la dirección del proveedor compatible en Ajustes.")?)
}
fn validate_target(endpoint: &Url, raw: &str) -> Result<Url, String> {
    let target = Url::parse(raw).map_err(|_| "La solicitud del proveedor no es válida.")?;
    let base = endpoint.path().trim_end_matches('/');
    if target.origin() != endpoint.origin() || !(target.path() == base || target.path().starts_with(&format!("{base}/"))) || !target.username().is_empty() || target.password().is_some() || target.fragment().is_some() {
        return Err("La solicitud no corresponde al proveedor configurado.".into());
    }
    if target.query_pairs().any(|(key, _)| ["key", "api_key", "api-key", "apikey", "token", "access_token"].contains(&key.to_lowercase().as_str())) {
        return Err("Las claves no se permiten en la dirección del proveedor.".into());
    }
    Ok(target)
}

#[derive(Deserialize)]
pub struct AiRequest { provider: String, url: String, method: String, headers: HashMap<String, String>, body: Option<String> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiResponse { status: u16, headers: HashMap<String, String>, body_base64: String }

fn request_headers(provider: &str, provided: HashMap<String, String>, key: Option<&str>) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    for (name, value) in provided {
        let lower = name.to_ascii_lowercase();
        if ["content-type", "accept", "anthropic-version", "anthropic-beta"].contains(&lower.as_str()) {
            headers.insert(HeaderName::from_bytes(lower.as_bytes()).map_err(|_| "Cabecera inválida.")?, HeaderValue::from_str(&value).map_err(|_| "Cabecera inválida.")?);
        }
    }
    if provider == "anthropic" && !headers.contains_key("anthropic-version") { headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01")); }
    if let Some(key) = key {
        let (name, value) = match provider {
            "gemini" => ("x-goog-api-key", key.to_string()), "anthropic" => ("x-api-key", key.to_string()), "elevenlabs" => ("xi-api-key", key.to_string()),
            _ => ("authorization", format!("Bearer {key}")),
        };
        let mut value = HeaderValue::from_str(&value).map_err(|_| "La clave guardada no es válida.")?;
        value.set_sensitive(true);
        headers.insert(name, value);
    }
    Ok(headers)
}

#[tauri::command]
pub async fn ai_request(app: AppHandle, request: AiRequest) -> Result<AiResponse, String> {
    provider_id(&request.provider)?;
    if !["GET", "POST"].contains(&request.method.as_str()) || request.body.as_ref().map_or(false, |body| body.len() > MAX_REQUEST) { return Err("La solicitud de IA no es válida o es demasiado grande.".into()); }
    let config = app_config(&app)?;
    let endpoint = configured_endpoint(&config, &request.provider)?;
    let target = validate_target(&endpoint, &request.url)?;
    let key = { let _guard = VAULT_LOCK.lock().map_err(|_| "No se pudo abrir el almacén de claves.")?; read_key(&config, &request.provider)? };
    let local_compatible = request.provider == "compatible" && matches!(endpoint.host_str(), Some("localhost" | "127.0.0.1" | "[::1]" | "::1"));
    if key.is_none() && request.provider != "ollama" && !local_compatible { return Err("Guarda tu clave del proveedor en Ajustes antes de generar.".into()); }
    // No se reenvía autorización a redirecciones: https://docs.rs/reqwest/latest/reqwest/redirect/struct.Policy.html#method.none
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(180)).connect_timeout(Duration::from_secs(20)).build().map_err(|_| "No se pudo preparar la conexión con el proveedor.")?;
    let mut pending = client.request(if request.method == "POST" { reqwest::Method::POST } else { reqwest::Method::GET }, target).headers(request_headers(&request.provider, request.headers, key.as_deref())?);
    if let Some(body) = request.body { pending = pending.body(body); }
    let mut response = pending.send().await.map_err(|error| if error.is_timeout() { "El proveedor tardó demasiado. Reintenta la generación.".to_string() } else { "No se pudo contactar con el proveedor. Comprueba la conexión y su dirección en Ajustes.".to_string() })?;
    let status = response.status().as_u16();
    if response.content_length().map_or(false, |size| size > MAX_RESPONSE as u64) { return Err("El recurso generado supera el tamaño permitido.".into()); }
    let mut data = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "Se interrumpió la descarga del recurso generado.")? {
        if data.len() + chunk.len() > MAX_RESPONSE { return Err("El recurso generado supera el tamaño permitido.".into()); }
        data.extend_from_slice(&chunk);
    }
    let mut headers = HashMap::new();
    if let Some(value) = response.headers().get("content-type").and_then(|value| value.to_str().ok()) { headers.insert("content-type".into(), value.to_string()); }
    // Los errores del proveedor pueden repetir la clave recibida. Solo devolvemos
    // error.message breve, con la clave exacta eliminada; nunca URL ni cabeceras.
    if status >= 300 {
        let message = serde_json::from_slice::<serde_json::Value>(&data).ok().and_then(|json| json.pointer("/error/message").and_then(|v| v.as_str()).or_else(|| json.pointer("/detail/message").and_then(|v| v.as_str())).map(String::from));
        let message = message.unwrap_or_else(|| format!("El proveedor rechazó la solicitud ({status})."));
        let message = if let Some(key) = key { message.replace(&key, "[clave protegida]") } else { message };
        data = serde_json::to_vec(&serde_json::json!({ "error": { "message": message.chars().take(500).collect::<String>() } })).map_err(|_| "No se pudo interpretar el error del proveedor.")?;
        headers.insert("content-type".into(), "application/json".into());
    }
    Ok(AiResponse { status, headers, body_base64: STANDARD.encode(data) })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn provider_paths_cannot_escape_or_send_keys_to_another_origin() {
        assert!(key_file(Path::new("data"), "../otro").is_err());
        let base = Url::parse("https://generativelanguage.googleapis.com/v1beta").unwrap();
        for target in ["https://otro.example/v1beta/interactions", "http://generativelanguage.googleapis.com/v1beta/interactions", "https://generativelanguage.googleapis.com.evil.example/v1beta/interactions", "https://generativelanguage.googleapis.com/v1beta-mal/interactions", "https://generativelanguage.googleapis.com/v1beta/interactions?key=secreto"] {
            assert!(validate_target(&base, target).is_err(), "{target}");
        }
        assert!(validate_target(&base, "https://generativelanguage.googleapis.com/v1beta/interactions").is_ok());
    }
    #[test]
    fn only_explicit_loopback_models_may_use_plain_http() {
        assert!(validate_endpoint("ollama", "http://127.0.0.1:11434").is_ok());
        assert!(validate_endpoint("ollama", "http://192.168.1.1:11434").is_err());
        assert!(validate_endpoint("compatible", "http://localhost:1234/v1").is_ok());
        assert!(validate_endpoint("compatible", "http://192.168.1.1:1234/v1").is_err());
        assert!(validate_endpoint("openai", "http://localhost:8080/v1").is_err());
        assert!(validate_endpoint("compatible", "https://user:secret@example.com/v1").is_err());
        assert!(validate_endpoint("compatible", "https://example.com/v1?key=secret").is_err());
    }
    #[test]
    fn authentication_headers_are_injected_not_accepted_from_the_renderer() {
        let provided = HashMap::from([("authorization".into(), "Bearer wrong".into()), ("x-goog-api-key".into(), "wrong".into()), ("content-type".into(), "application/json".into())]);
        let headers = request_headers("gemini", provided, Some("test-secret")).unwrap();
        assert_eq!(headers.get("x-goog-api-key").unwrap(), "test-secret");
        assert!(headers.get("x-goog-api-key").unwrap().is_sensitive());
        assert!(!headers.contains_key("authorization"));
    }
    #[cfg(windows)]
    #[test]
    fn dpapi_roundtrip_does_not_store_plaintext() {
        let key = b"test-only-not-a-real-key";
        let encrypted = crypt(key, true).unwrap();
        assert!(!encrypted.windows(key.len()).any(|window| window == key));
        assert_eq!(crypt(&encrypted, false).unwrap(), key);
        assert!(crypt(b"corrupt", false).is_err());
    }
}
