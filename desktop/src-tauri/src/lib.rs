use chrono::Utc;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::{
  collections::HashMap,
  fs,
  io::Write,
  net::{SocketAddr, TcpStream, ToSocketAddrs, UdpSocket},
  path::PathBuf,
  process::{Child, Command, Stdio},
  sync::Mutex,
  time::{Duration, Instant},
};
use tauri::Manager;
use url::Url;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OnvifDevice { endpoint: String, address: String, scopes: Vec<String> }

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OnvifProfile { id: String, name: String, device_service_url: String, rtsp_url: String, username: String, created_at: String, updated_at: String }

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OnvifProfileInput { id: Option<String>, name: String, device_service_url: String, rtsp_url: String, username: String, password: String }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RtspProbe { endpoint: String, host: String, port: u16, connected: bool, latency_millis: u128, error: Option<String> }

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RtspCapture { session_id: String, camera_name: String, directory: String, started_at: String }

#[derive(Default)]
struct CaptureRegistry { children: Mutex<HashMap<String, Child>> }

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BiometricControls { face_recognition_enabled: bool, emotional_signal_enabled: bool, explicit_consent_recorded: bool, human_review_required: bool, retention_days: u8 }

impl Default for BiometricControls {
  fn default() -> Self { Self { face_recognition_enabled: false, emotional_signal_enabled: false, explicit_consent_recorded: false, human_review_required: true, retention_days: 7 } }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AnalysisCapability { key: &'static str, title: &'static str, category: &'static str, requires_consent: bool, model_status: &'static str, review_required: bool }

fn extract_tag(xml: &str, suffix: &str) -> Option<String> {
  let start = xml.find(&format!("<{}", suffix)).or_else(|| xml.find(&format!("<d:{}", suffix)))?;
  let content_start = xml[start..].find('>')? + start + 1;
  let end = xml[content_start..].find('<')? + content_start;
  Some(xml[content_start..end].trim().to_string())
}

fn controls_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let path = app.path().app_data_dir().map_err(|error| error.to_string())?;
  fs::create_dir_all(&path).map_err(|error| error.to_string())?;
  Ok(path.join("biometric-controls.json"))
}

fn profiles_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let path = app.path().app_data_dir().map_err(|error| error.to_string())?;
  fs::create_dir_all(&path).map_err(|error| error.to_string())?;
  Ok(path.join("onvif-profiles.json"))
}

fn read_profiles(app: &tauri::AppHandle) -> Result<Vec<OnvifProfile>, String> {
  let path = profiles_path(app)?;
  if !path.exists() { return Ok(Vec::new()); }
  serde_json::from_slice(&fs::read(path).map_err(|error| error.to_string())?).map_err(|error| format!("Perfis ONVIF inválidos: {error}"))
}

fn write_profiles(app: &tauri::AppHandle, profiles: &[OnvifProfile]) -> Result<(), String> {
  let content = serde_json::to_vec_pretty(profiles).map_err(|error| error.to_string())?;
  fs::write(profiles_path(app)?, content).map_err(|error| error.to_string())
}

fn credential_entry(id: &str) -> Result<Entry, String> {
  Entry::new("com.spacevision.dvr", &format!("onvif-profile:{id}")).map_err(|error| format!("Cofre de credenciais indisponível: {error}"))
}

fn make_profile_id(name: &str) -> String {
  let slug: String = name.chars().map(|character| if character.is_ascii_alphanumeric() { character.to_ascii_lowercase() } else { '_' }).collect();
  format!("{}-{}", slug.trim_matches('_'), Utc::now().timestamp_millis())
}

fn valid_rtsp_url(endpoint: &str) -> Result<Url, String> {
  let url = Url::parse(endpoint).map_err(|error| format!("URL RTSP inválida: {error}"))?;
  if url.scheme() != "rtsp" && url.scheme() != "rtsps" { return Err("Use os esquemas rtsp:// ou rtsps://.".to_string()); }
  if url.host_str().is_none() { return Err("A URL RTSP não possui host.".to_string()); }
  Ok(url)
}

fn valid_onvif_url(endpoint: &str) -> Result<(), String> {
  let url = Url::parse(endpoint).map_err(|error| format!("URL ONVIF inválida: {error}"))?;
  if url.scheme() != "http" && url.scheme() != "https" { return Err("Use URL ONVIF com http:// ou https://.".to_string()); }
  if url.host_str().is_none() { return Err("A URL ONVIF não possui host.".to_string()); }
  Ok(())
}

fn capture_args(endpoint: &str, output_pattern: &str) -> Vec<String> {
  vec!["-hide_banner".into(), "-nostdin".into(), "-rtsp_transport".into(), "tcp".into(), "-i".into(), endpoint.into(), "-map".into(), "0:v:0?".into(), "-c".into(), "copy".into(), "-f".into(), "segment".into(), "-segment_time".into(), "60".into(), "-reset_timestamps".into(), "1".into(), output_pattern.into()]
}

fn worker_path(app: &tauri::AppHandle) -> PathBuf {
  if let Ok(resource_dir) = app.path().resource_dir() {
    let packaged = resource_dir.join("vision-worker/worker.py");
    if packaged.is_file() { return packaged; }
  }
  PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../vision-worker/worker.py")
}

#[tauri::command]
fn discover_onvif_devices(timeout_ms: u64) -> Result<Vec<OnvifDevice>, String> {
  let socket = UdpSocket::bind("0.0.0.0:0").map_err(|error| error.to_string())?;
  socket.set_read_timeout(Some(Duration::from_millis(timeout_ms.min(10_000)))).map_err(|error| error.to_string())?;
  let probe = r#"<?xml version="1.0" encoding="UTF-8"?><e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://docs.oasis-open.org/ws-dd/ns/discovery/2009/01"><e:Header><w:MessageID>uuid:spacevision-onvif-discovery</w:MessageID><w:To>urn:docs-oasis-open-org:ws-dd:ns:discovery:2009:01</w:To><w:Action>http://docs.oasis-open.org/ws-dd/ns/discovery/2009/01/Probe</w:Action></e:Header><e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>"#;
  socket.send_to(probe.as_bytes(), "239.255.255.250:3702").map_err(|error| error.to_string())?;
  let started = Instant::now(); let mut devices = Vec::new(); let mut buffer = [0u8; 8192];
  while started.elapsed() < Duration::from_millis(timeout_ms.min(10_000)) {
    match socket.recv_from(&mut buffer) {
      Ok((size, source)) => { let xml = String::from_utf8_lossy(&buffer[..size]); let endpoint = extract_tag(&xml, "XAddrs").unwrap_or_else(|| format!("http://{}", source.ip())); let scopes = extract_tag(&xml, "Scopes").map(|value| value.split_whitespace().map(str::to_owned).collect()).unwrap_or_default(); if !devices.iter().any(|device: &OnvifDevice| device.endpoint == endpoint) { devices.push(OnvifDevice { endpoint, address: source.ip().to_string(), scopes }); } }
      Err(error) if error.kind() == std::io::ErrorKind::WouldBlock || error.kind() == std::io::ErrorKind::TimedOut => break,
      Err(error) => return Err(error.to_string()),
    }
  }
  Ok(devices)
}

#[tauri::command]
fn list_onvif_profiles(app: tauri::AppHandle) -> Result<Vec<OnvifProfile>, String> {
  read_profiles(&app)
}

#[tauri::command]
fn save_onvif_profile(app: tauri::AppHandle, input: OnvifProfileInput) -> Result<OnvifProfile, String> {
  if input.name.trim().is_empty() || input.username.trim().is_empty() { return Err("Nome e usuário ONVIF são obrigatórios.".to_string()); }
  if input.password.is_empty() { return Err("A senha ONVIF é obrigatória e será guardada no cofre do sistema.".to_string()); }
  valid_onvif_url(&input.device_service_url)?;
  valid_rtsp_url(&input.rtsp_url)?;
  let id = input.id.unwrap_or_else(|| make_profile_id(&input.name));
  credential_entry(&id)?.set_password(&input.password).map_err(|error| format!("Não foi possível guardar a senha ONVIF: {error}"))?;
  let now = Utc::now().to_rfc3339();
  let profile = OnvifProfile { id: id.clone(), name: input.name, device_service_url: input.device_service_url, rtsp_url: input.rtsp_url, username: input.username, created_at: now.clone(), updated_at: now };
  let mut profiles = read_profiles(&app)?;
  if let Some(position) = profiles.iter().position(|existing| existing.id == id) { profile.created_at.clone_into(&mut profiles[position].created_at); profiles[position] = profile.clone(); }
  else { profiles.push(profile.clone()); }
  write_profiles(&app, &profiles)?;
  Ok(profile)
}

#[tauri::command]
fn delete_onvif_profile(app: tauri::AppHandle, id: String) -> Result<(), String> {
  let mut profiles = read_profiles(&app)?;
  let initial = profiles.len();
  profiles.retain(|profile| profile.id != id);
  if profiles.len() == initial { return Err("Perfil ONVIF não encontrado.".to_string()); }
  write_profiles(&app, &profiles)?;
  let _ = credential_entry(&id)?.delete_credential();
  Ok(())
}

#[tauri::command]
fn probe_rtsp(endpoint: String) -> Result<RtspProbe, String> {
  let url = valid_rtsp_url(&endpoint)?;
  let host = url.host_str().expect("URL validada sem host").to_string();
  let port = url.port_or_known_default().unwrap_or(554);
  let address: SocketAddr = format!("{host}:{port}").to_socket_addrs().map_err(|error| error.to_string())?.next().ok_or("Não foi possível resolver o host RTSP.")?;
  let started = Instant::now();
  match TcpStream::connect_timeout(&address, Duration::from_secs(3)) {
    Ok(_) => Ok(RtspProbe { endpoint, host, port, connected: true, latency_millis: started.elapsed().as_millis(), error: None }),
    Err(error) => Ok(RtspProbe { endpoint, host, port, connected: false, latency_millis: started.elapsed().as_millis(), error: Some(error.to_string()) }),
  }
}

#[tauri::command]
fn start_rtsp_capture(app: tauri::AppHandle, registry: tauri::State<CaptureRegistry>, endpoint: String, camera_name: String) -> Result<RtspCapture, String> {
  valid_rtsp_url(&endpoint)?;
  let safe_name: String = camera_name.chars().map(|character| if character.is_ascii_alphanumeric() { character.to_ascii_lowercase() } else { '_' }).collect();
  let session_id = format!("{}-{}", safe_name.trim_matches('_'), Utc::now().timestamp_millis());
  let output_dir = app.path().app_data_dir().map_err(|error| error.to_string())?.join("recordings").join(&session_id);
  fs::create_dir_all(&output_dir).map_err(|error| error.to_string())?;
  let output_pattern = output_dir.join("segment_%05d.mp4").to_string_lossy().to_string();
  let child = Command::new("ffmpeg").args(capture_args(&endpoint, &output_pattern)).spawn().map_err(|error| format!("FFmpeg não foi iniciado: {error}. Instale ou empacote um sidecar FFmpeg autorizado."))?;
  registry.children.lock().map_err(|_| "Registro de captura indisponível.".to_string())?.insert(session_id.clone(), child);
  Ok(RtspCapture { session_id, camera_name, directory: output_dir.to_string_lossy().to_string(), started_at: Utc::now().to_rfc3339() })
}

#[tauri::command]
fn stop_rtsp_capture(registry: tauri::State<CaptureRegistry>, session_id: String) -> Result<(), String> {
  let mut child = registry.children.lock().map_err(|_| "Registro de captura indisponível.".to_string())?.remove(&session_id).ok_or("Sessão RTSP não encontrada.")?;
  child.kill().map_err(|error| error.to_string())?;
  let _ = child.wait();
  Ok(())
}

#[tauri::command]
fn analyze_snapshot(app: tauri::AppHandle, request: serde_json::Value) -> Result<serde_json::Value, String> {
  let script = worker_path(&app);
  if !script.is_file() { return Err("Worker local de visão não encontrado. Empacote-o como sidecar na distribuição final.".to_string()); }
  let interpreter = if cfg!(target_os = "windows") { "python" } else { "python3" };
  let mut child = Command::new(interpreter).arg(script).stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().map_err(|error| format!("Worker local não iniciou: {error}"))?;
  let payload = serde_json::to_string(&request).map_err(|error| error.to_string())?;
  child.stdin.as_mut().ok_or("Entrada do worker indisponível.")?.write_all(format!("{payload}\n").as_bytes()).map_err(|error| error.to_string())?;
  let output = child.wait_with_output().map_err(|error| error.to_string())?;
  if !output.status.success() { return Err(format!("Worker local encerrou com status {}.", output.status)); }
  let line = String::from_utf8(output.stdout).map_err(|error| error.to_string())?.lines().next().ok_or("Worker não retornou resultado.")?.to_string();
  serde_json::from_str(&line).map_err(|error| format!("Resposta inválida do worker: {error}"))
}

#[tauri::command]
fn analysis_capabilities() -> Vec<AnalysisCapability> {
  vec![
    AnalysisCapability { key: "objects", title: "Detecção de objetos", category: "visão", requires_consent: false, model_status: "Adaptador ONNX local", review_required: true },
    AnalysisCapability { key: "ocr", title: "OCR de cenas", category: "texto", requires_consent: false, model_status: "Adaptador OCR local", review_required: true },
    AnalysisCapability { key: "plates", title: "Placas veiculares", category: "veículos", requires_consent: false, model_status: "Detector + OCR local", review_required: true },
    AnalysisCapability { key: "activities", title: "Atividades e postura", category: "comportamento", requires_consent: false, model_status: "Modelo temporal local", review_required: true },
    AnalysisCapability { key: "anomalies", title: "Anomalias", category: "comportamento", requires_consent: false, model_status: "Baseline por câmera", review_required: true },
    AnalysisCapability { key: "faces", title: "Comparação facial", category: "biometria", requires_consent: true, model_status: "Desativado até habilitação", review_required: true },
    AnalysisCapability { key: "emotion", title: "Sinais emocionais", category: "biometria sensível", requires_consent: true, model_status: "Hipótese; não é decisão", review_required: true },
  ]
}

fn validate_biometric_controls(controls: &BiometricControls) -> Result<(), String> {
  if controls.retention_days == 0 || controls.retention_days > 30 { return Err("A retenção de biometria deve ficar entre 1 e 30 dias.".to_string()); }
  if (controls.face_recognition_enabled || controls.emotional_signal_enabled) && !controls.explicit_consent_recorded { return Err("Habilite recursos biométricos somente após registrar consentimento ou fundamento autorizado.".to_string()); }
  if !controls.human_review_required { return Err("A revisão humana é obrigatória para fluxos biométricos e comportamentais.".to_string()); }
  Ok(())
}

#[tauri::command]
fn save_biometric_controls(app: tauri::AppHandle, controls: BiometricControls) -> Result<BiometricControls, String> {
  validate_biometric_controls(&controls)?;
  let content = serde_json::to_vec_pretty(&controls).map_err(|error| error.to_string())?;
  fs::write(controls_path(&app)?, content).map_err(|error| error.to_string())?;
  Ok(controls)
}

pub fn run() {
  tauri::Builder::default().manage(CaptureRegistry::default()).invoke_handler(tauri::generate_handler![discover_onvif_devices, list_onvif_profiles, save_onvif_profile, delete_onvif_profile, probe_rtsp, start_rtsp_capture, stop_rtsp_capture, analyze_snapshot, analysis_capabilities, save_biometric_controls]).run(tauri::generate_context!()).expect("erro ao iniciar SpaceVision Desktop");
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn bloqueia_biometria_sem_consentimento_registrado() {
    let controls = BiometricControls { face_recognition_enabled: true, ..BiometricControls::default() };
    assert!(validate_biometric_controls(&controls).unwrap_err().contains("consentimento"));
  }

  #[test]
  fn exige_revisao_humana_para_fluxos_sensiveis() {
    let controls = BiometricControls { explicit_consent_recorded: true, face_recognition_enabled: true, human_review_required: false, ..BiometricControls::default() };
    assert!(validate_biometric_controls(&controls).unwrap_err().contains("revisão humana"));
  }

  #[test]
  fn aceita_politica_biometrica_limitada_e_revisavel() {
    let controls = BiometricControls { explicit_consent_recorded: true, face_recognition_enabled: true, human_review_required: true, retention_days: 7, ..BiometricControls::default() };
    assert!(validate_biometric_controls(&controls).is_ok());
  }

  #[test]
  fn cria_args_de_captura_sem_shell_e_com_segmentacao() {
    let args = capture_args("rtsp://camera.local/stream", "/tmp/segment_%05d.mp4");
    assert!(args.windows(2).any(|pair| pair == ["-rtsp_transport", "tcp"]));
    assert!(args.windows(2).any(|pair| pair == ["-segment_time", "60"]));
    assert_eq!(args.last(), Some(&"/tmp/segment_%05d.mp4".to_string()));
  }

  #[test]
  fn valida_urls_onvif_e_rtsp_de_perfis() {
    assert!(valid_onvif_url("http://camera.local/onvif/device_service").is_ok());
    assert!(valid_onvif_url("rtsp://camera.local/stream").is_err());
    assert!(valid_rtsp_url("rtsp://camera.local/stream").is_ok());
    assert!(valid_rtsp_url("https://camera.local/stream").is_err());
  }
}
