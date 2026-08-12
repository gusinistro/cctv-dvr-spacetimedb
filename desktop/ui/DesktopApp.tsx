import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { reportCameraHealth, reviewAnalysisEvent, startDesktopSpacetimeBridge, submitAnalysisResult, type DesktopSyncState } from "./spacetimeBridge";
import { can } from "../../client/src/lib/cctv/access";

type Tab = "monitor" | "cameras" | "analysis" | "governance";
type OnvifDevice = { endpoint: string; address: string; scopes: string[] };
type OnvifProfile = { id: string; name: string; deviceServiceUrl: string; rtspUrl: string; username: string; createdAt: string; updatedAt: string };
type RtspProbe = { endpoint: string; host: string; port: number; connected: boolean; latencyMillis: number; error?: string };
type RtspCapture = { sessionId: string; cameraName: string; directory: string; startedAt: string };
type BiometricControls = { faceRecognitionEnabled: boolean; emotionalSignalEnabled: boolean; explicitConsentRecorded: boolean; humanReviewRequired: boolean; retentionDays: number };
type Capability = { key: string; title: string; category: string; requiresConsent: boolean; modelStatus: string; reviewRequired: boolean };

const initialControls: BiometricControls = { faceRecognitionEnabled: false, emotionalSignalEnabled: false, explicitConsentRecorded: false, humanReviewRequired: true, retentionDays: 7 };
const initialSync: DesktopSyncState = { connected: false, analysisEvents: 0, pendingReviews: 0, auditRecords: 0, queue: [], installations: [], cameras: [], cameraHealth: [], evidenceRecords: 0, role: "viewer", reason: "conectando à instância local" };
const initialProfile = { name: "", deviceServiceUrl: "http://192.168.1.100/onvif/device_service", rtspUrl: "rtsp://192.168.1.100:554/stream1", username: "", password: "" };

export default function DesktopApp() {
  const [tab, setTab] = useState<Tab>("monitor");
  const [rtsp, setRtsp] = useState("rtsp://192.168.1.100:554/stream1");
  const [devices, setDevices] = useState<OnvifDevice[]>([]);
  const [profiles, setProfiles] = useState<OnvifProfile[]>([]);
  const [profileInput, setProfileInput] = useState(initialProfile);
  const [probe, setProbe] = useState<RtspProbe | null>(null);
  const [capture, setCapture] = useState<RtspCapture | null>(null);
  const [imagePath, setImagePath] = useState("");
  const [analysisResult, setAnalysisResult] = useState<{ results?: unknown[]; blocked?: unknown[] } | null>(null);
  const [analysisCameraId, setAnalysisCameraId] = useState(0);
  const [notice, setNotice] = useState("Pronto para procurar câmeras na rede local.");
  const [controls, setControls] = useState<BiometricControls>(initialControls);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [sync, setSync] = useState<DesktopSyncState>(initialSync);

  useEffect(() => { void invoke<Capability[]>("analysis_capabilities").then(setCapabilities).catch(() => setNotice("O catálogo de análise local não está disponível.")); }, []);
  useEffect(() => { void invoke<OnvifProfile[]>("list_onvif_profiles").then(setProfiles).catch(() => setNotice("Não foi possível abrir o cofre de perfis ONVIF.")); }, []);
  useEffect(() => startDesktopSpacetimeBridge(setSync), []);
  useEffect(() => { if (!analysisCameraId && sync.cameras.length) setAnalysisCameraId(sync.cameras[0].id); }, [analysisCameraId, sync.cameras]);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select")) return;
      const destination = ({ "1": "monitor", "2": "cameras", "3": "analysis", "4": "governance" } as Record<string, Tab | undefined>)[event.key];
      if (!destination) return;
      event.preventDefault();
      setTab(destination);
      setNotice(`Atalho aplicado: ${destination === "monitor" ? "Operação" : destination === "cameras" ? "Câmeras" : destination === "analysis" ? "Análise" : "Governança"}.`);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);
  const protectedCount = useMemo(() => capabilities.filter((capability) => capability.requiresConsent).length, [capabilities]);
  const canReview = can(sync.role, "review_analysis");
  const canManageBiometrics = can(sync.role, "manage_biometrics");
  const canRunDiagnostics = can(sync.role, "diagnostics");

  async function discover() {
    setNotice("Enviando WS-Discovery ONVIF na rede local...");
    try {
      const found = await invoke<OnvifDevice[]>("discover_onvif_devices", { timeoutMs: 3500 });
      setDevices(found);
      setNotice(found.length ? `${found.length} dispositivo(s) ONVIF encontrados.` : "Nenhuma resposta ONVIF recebida. Verifique VLAN, multicast e credenciais.");
    } catch (error) { setNotice(`Falha na descoberta ONVIF: ${String(error)}`); }
  }

  async function checkRtsp() {
    setNotice("Testando conectividade TCP do endpoint RTSP...");
    try {
      const result = await invoke<RtspProbe>("probe_rtsp", { endpoint: rtsp });
      setProbe(result);
      setNotice(result.connected ? `Endpoint acessível em ${result.latencyMillis} ms.` : result.error || "Endpoint indisponível.");
    } catch (error) { setNotice(`URL RTSP inválida ou indisponível: ${String(error)}`); }
  }

  async function saveProfile() {
    try {
      const saved = await invoke<OnvifProfile>("save_onvif_profile", { input: profileInput });
      setProfiles((current) => [...current.filter((profile) => profile.id !== saved.id), saved]);
      setProfileInput(initialProfile); setNotice(`Perfil ${saved.name} guardado; a senha foi enviada ao cofre do sistema.`);
    } catch (error) { setNotice(`Não foi possível guardar o perfil ONVIF: ${String(error)}`); }
  }

  async function removeProfile(id: string) {
    try { await invoke("delete_onvif_profile", { id }); setProfiles((current) => current.filter((profile) => profile.id !== id)); setNotice("Perfil ONVIF e credencial associada removidos."); }
    catch (error) { setNotice(`Não foi possível remover o perfil: ${String(error)}`); }
  }

  async function startCapture() {
    setNotice("Iniciando gravação RTSP local segmentada...");
    try {
      const session = await invoke<RtspCapture>("start_rtsp_capture", { endpoint: rtsp, cameraName: "camera-local" });
      setCapture(session); setNotice(`Captura ativa em ${session.directory}.`);
    } catch (error) { setNotice(`A captura não iniciou: ${String(error)}`); }
  }

  async function stopCapture() {
    if (!capture) return;
    try { await invoke("stop_rtsp_capture", { sessionId: capture.sessionId }); setNotice("Captura RTSP interrompida com segurança."); setCapture(null); }
    catch (error) { setNotice(`Não foi possível encerrar a captura: ${String(error)}`); }
  }

  async function saveControls() {
    try {
      const saved = await invoke<BiometricControls>("save_biometric_controls", { controls });
      setControls(saved);
      setNotice("Controles biométricos salvos localmente. Resultados continuam sujeitos a revisão humana.");
    } catch (error) { setNotice(`Não foi possível salvar a política: ${String(error)}`); }
  }

  async function review(itemId: number, decision: "approved" | "rejected") {
    try { await reviewAnalysisEvent(itemId, decision); setNotice(`Evento analítico ${decision === "approved" ? "aprovado" : "rejeitado"} e auditado.`); }
    catch (error) { setNotice(`Não foi possível registrar a revisão: ${String(error)}`); }
  }

  async function reportHealth(cameraId: number, success: boolean) {
    try {
      await reportCameraHealth(cameraId, success, success ? "Diagnóstico RTSP confirmou conectividade." : "Inspeção preventiva solicitada após falha de diagnóstico.", success ? "none" : "scheduled");
      setNotice(success ? "Diagnóstico registrado como saudável e auditado." : "Falha registrada; a câmera entrou na fila de manutenção preventiva.");
    } catch (error) { setNotice(`Não foi possível registrar a saúde técnica: ${String(error)}`); }
  }

  async function transitionMaintenance(cameraId: number, maintenanceStatus: "scheduled" | "in_progress" | "completed") {
    try {
      const note = maintenanceStatus === "scheduled" ? "Manutenção preventiva programada no desktop." : maintenanceStatus === "in_progress" ? "Manutenção preventiva em andamento no desktop." : "Manutenção preventiva concluída no desktop.";
      await reportCameraHealth(cameraId, maintenanceStatus === "completed", note, maintenanceStatus);
      setNotice(`Manutenção da câmera atualizada para ${maintenanceStatus} e auditada.`);
    } catch (error) { setNotice(`Não foi possível atualizar a manutenção: ${String(error)}`); }
  }

  async function runLocalAnalysis() {
    if (!imagePath.trim()) { setNotice("Informe o caminho local de uma imagem ou frame extraído para análise."); return; }
    if (!analysisCameraId) { setNotice("Selecione a câmera de origem antes de encaminhar a análise."); return; }
    setNotice("Executando análise local; somente metadados revisáveis serão sincronizados.");
    try {
      const response = await invoke<{ results?: unknown[]; blocked?: unknown[] }>("analyze_snapshot", {
        request: {
          action: "analyze", imagePath,
          tasks: ["objects", "ocr", "plates", "activities", "anomaly", "faces", "emotion"],
          policy: { faceEnabled: controls.faceRecognitionEnabled, emotionEnabled: controls.emotionalSignalEnabled, consentRecorded: controls.explicitConsentRecorded, humanReviewRequired: controls.humanReviewRequired },
        },
      });
      setAnalysisResult(response);
      if (sync.connected) await submitAnalysisResult(analysisCameraId, response, imagePath);
      setNotice(sync.connected ? "Análise concluída e metadados enviados à fila de revisão." : "Análise concluída localmente; conecte o SpacetimeDB para registrar a fila.");
    } catch (error) { setNotice(`A análise local falhou: ${String(error)}`); }
  }

  return <main className="desktop-shell">
    <aside>
      <div className="brand"><span className="brand-mark">◉</span><div><strong>SPACEVISION</strong><small>DESKTOP / EDGE DVR</small></div></div>
      <p className="edge-state"><i /> Nó local protegido</p>
      {([ ["monitor", "Operação"], ["cameras", "Câmeras"], ["analysis", "Análise"], ["governance", "Governança"] ] as [Tab, string][]).map(([key, label], index) => <button className={tab === key ? "nav active" : "nav"} key={key} onClick={() => setTab(key)} aria-current={tab === key ? "page" : undefined} title={`Ctrl/Cmd+${index + 1}`}>{label}</button>)}
      <p className="shortcut-help">Atalhos: Ctrl/Cmd + 1–4 alternam as áreas quando nenhum formulário está em foco.</p>
      <footer><span>{sync.connected ? `SpacetimeDB · ${sync.role}` : "SpacetimeDB local"}</span><small>{sync.connected ? `${sync.actorName ?? "Sessão"} · ${sync.pendingReviews} revisão(ões)` : sync.reason}</small></footer>
    </aside>
    <section className="desktop-main">
      <header><div><p>OPERAÇÃO LOCAL</p><h1>{tab === "monitor" ? "Central de borda" : tab === "cameras" ? "Descoberta e conectividade" : tab === "analysis" ? "Análise de vídeo" : "Controles sensíveis"}</h1></div><div className="status-chip">● {sync.connected ? "SpacetimeDB reativo" : "processamento local"}</div></header>
      <div className="notice" role="status" aria-live="polite">{notice}</div>
      {tab === "monitor" && <div className="monitor-grid"><section className="video-stage"><span>CAM 01 · ENTRADA PRINCIPAL</span><div className="scanline"/><p>RTSP/ONVIF · stream local · sem upload de vídeo bruto</p></section><section className="system-card"><h2>Encaminhamento de eventos</h2><dl><div><dt>Eventos analíticos</dt><dd>{sync.analysisEvents} no SpacetimeDB</dd></div><div><dt>Revisões pendentes</dt><dd>{sync.pendingReviews} obrigatória(s)</dd></div><div><dt>Registros de auditoria</dt><dd>{sync.auditRecords} metadados</dd></div><div><dt>Evidências íntegras</dt><dd>{sync.evidenceRecords} registro(s) com hash</dd></div><div><dt>Saúde degradada</dt><dd>{sync.cameraHealth.filter((item) => item.consecutiveFailures > 0).length} câmera(s)</dd></div></dl></section></div>}
      {tab === "cameras" && <div className="columns"><section className="panel"><h2>Descobrir ONVIF</h2><p>Pesquisa WS-Discovery no multicast local. Câmeras em redes isoladas podem exigir descoberta manual.</p><button className="primary" onClick={() => void discover()}>Procurar dispositivos</button><div className="device-list">{devices.length ? devices.map((device) => <article key={device.endpoint}><strong>{device.address}</strong><span>{device.endpoint}</span></article>) : <em>Nenhuma câmera descoberta nesta sessão.</em>}</div></section><section className="panel"><h2>RTSP: diagnóstico e captura</h2><label>Endpoint RTSP<input value={rtsp} onChange={(event) => setRtsp(event.target.value)} /></label><button className="primary" onClick={() => void checkRtsp()}>Testar conectividade</button>{capture ? <button className="primary" onClick={() => void stopCapture()}>Parar captura</button> : <button className="primary" onClick={() => void startCapture()}>Iniciar captura local</button>}{probe && <div className={probe.connected ? "probe ok" : "probe fail"}><strong>{probe.connected ? "Acessível" : "Indisponível"}</strong><span>{probe.host}:{probe.port} · {probe.latencyMillis} ms</span></div>}{probe && analysisCameraId > 0 && <button className="primary" disabled={!canRunDiagnostics || !sync.connected} onClick={() => void reportHealth(analysisCameraId, probe.connected)}>Registrar saúde da câmera</button>}{!canRunDiagnostics && <em>Seu papel não pode registrar diagnósticos compartilhados.</em>}{capture && <div className="probe ok"><strong>Gravando segmentos</strong><span>{capture.directory}</span></div>}</section><section className="panel"><h2>Perfil ONVIF seguro</h2><p>Metadados permanecem neste dispositivo; senhas vão somente ao cofre do sistema.</p><label>Nome<input value={profileInput.name} onChange={(event) => setProfileInput({ ...profileInput, name: event.target.value })} /></label><label>Serviço ONVIF<input value={profileInput.deviceServiceUrl} onChange={(event) => setProfileInput({ ...profileInput, deviceServiceUrl: event.target.value })} /></label><label>Endpoint RTSP<input value={profileInput.rtspUrl} onChange={(event) => setProfileInput({ ...profileInput, rtspUrl: event.target.value })} /></label><label>Usuário<input value={profileInput.username} onChange={(event) => setProfileInput({ ...profileInput, username: event.target.value })} /></label><label>Senha<input type="password" value={profileInput.password} onChange={(event) => setProfileInput({ ...profileInput, password: event.target.value })} /></label><button className="primary" onClick={() => void saveProfile()}>Guardar perfil</button><div className="device-list">{profiles.map((profile) => <article key={profile.id}><strong>{profile.name}</strong><span>{profile.username} · {profile.rtspUrl}</span><div><button className="primary" onClick={() => { setRtsp(profile.rtspUrl); setNotice(`Endpoint de ${profile.name} carregado; credenciais permanecem no cofre.`); }}>Usar RTSP</button><button className="primary" onClick={() => void removeProfile(profile.id)}>Remover</button></div></article>)}</div></section><section className="panel"><h2>Saúde e manutenção</h2><p>Falhas consecutivas, estado e notas preventivas são sincronizados como metadados auditáveis.</p><div className="device-list">{sync.cameraHealth.length ? sync.cameraHealth.map((health) => <article key={health.cameraId}><strong>{sync.cameras.find((camera) => camera.id === health.cameraId)?.name ?? `Câmera #${health.cameraId}`}</strong><span>{health.consecutiveFailures ? `${health.consecutiveFailures} falha(s) consecutiva(s)` : "Saudável"} · manutenção: {health.maintenanceStatus}{health.maintenanceNote ? ` · ${health.maintenanceNote}` : ""}</span></article>) : <em>Conecte uma instância para consultar saúde e manutenção.</em>}</div></section></div>}
      {tab === "analysis" && <div className="analysis-grid">{capabilities.map((capability) => <article className="capability" key={capability.key}><div><small>{capability.category}</small><h2>{capability.title}</h2></div><p>{capability.modelStatus}</p><span className={capability.requiresConsent ? "guard" : "ready"}>{capability.requiresConsent ? "Consentimento + revisão" : "Modelo local configurável"}</span></article>)}<section className="panel pipeline"><h2>Executar análise local</h2><p>Informe um frame local para OCR, anomalia e modelos aprovados. Vídeo bruto permanece no dispositivo.</p><label>Câmera de origem<select value={analysisCameraId} onChange={(event) => setAnalysisCameraId(Number(event.target.value))}><option value={0}>Selecione uma câmera</option>{sync.cameras.map((camera) => <option value={camera.id} key={camera.id}>{camera.name}</option>)}</select></label><label>Caminho local do frame<input value={imagePath} placeholder="/dados/camera/frame.jpg" onChange={(event) => setImagePath(event.target.value)} /></label><button className="primary" onClick={() => void runLocalAnalysis()}>Analisar e encaminhar metadados</button>{analysisResult && <p>{analysisResult.results?.length ?? 0} resultado(s) processado(s); {analysisResult.blocked?.length ?? 0} fluxo(s) bloqueado(s) por política.</p>}</section><section className="panel pipeline"><h2>Fila de revisão</h2><p>Frame local → análise por modelo registrado → evento com confiança → fila de revisão → sincronização de metadados. O desktop não envia vídeo bruto ao SpacetimeDB por padrão.</p>{sync.connected && <div className="device-list">{sync.queue.length ? sync.queue.map((item) => <article key={item.id}><strong>{item.task} · {item.classification} · {item.confidence}</strong><span>Câmera #{item.cameraId} · {item.biometric ? "biometria: consentimento e revisão obrigatórios" : "revisão humana pendente"}</span><div><button className="primary" disabled={!canReview} onClick={() => void review(item.id, "approved")}>Aprovar</button><button className="primary" disabled={!canReview} onClick={() => void review(item.id, "rejected")}>Rejeitar</button>{!canReview && <em>Seu papel não pode revisar incidentes.</em>}</div></article>) : <em>Não há itens pendentes de revisão.</em>}</div>}</section></div>}
      {tab === "governance" && <section className="governance"><div className="panel"><h2>Dados biométricos e sinais emocionais</h2><p>Esses recursos são desativados inicialmente. Ative apenas após definir propósito legítimo, aviso apropriado, consentimento quando aplicável e processo de revisão humana.</p><label className="switch"><input type="checkbox" disabled={!canManageBiometrics} checked={controls.explicitConsentRecorded} onChange={(event) => setControls({ ...controls, explicitConsentRecorded: event.target.checked })} /><span />Consentimento ou fundamento autorizado registrado</label><label className="switch"><input type="checkbox" checked={controls.faceRecognitionEnabled} disabled={!canManageBiometrics || !controls.explicitConsentRecorded} onChange={(event) => setControls({ ...controls, faceRecognitionEnabled: event.target.checked })} /><span />Permitir comparação facial local</label><label className="switch"><input type="checkbox" checked={controls.emotionalSignalEnabled} disabled={!canManageBiometrics || !controls.explicitConsentRecorded} onChange={(event) => setControls({ ...controls, emotionalSignalEnabled: event.target.checked })} /><span />Permitir sinais emocionais como hipótese de alerta</label><label>Dias máximos de retenção<input type="number" disabled={!canManageBiometrics} min="1" max="30" value={controls.retentionDays} onChange={(event) => setControls({ ...controls, retentionDays: Number(event.target.value) })} /></label><button className="primary" disabled={!canManageBiometrics} onClick={() => void saveControls()}>Salvar política local</button>{!canManageBiometrics && <em>Somente administradores alteram políticas sensíveis.</em>}</div><aside className="review-card"><strong>{protectedCount} fluxos protegidos</strong><p>O sistema não toma decisões disciplinares, de acesso ou de segurança exclusivamente com reconhecimento facial ou estimativa emocional.</p><span>Auditoria obrigatória</span></aside></section>}
    </section>
  </main>;
}
