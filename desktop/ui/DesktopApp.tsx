import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { reviewAnalysisEvent, startDesktopSpacetimeBridge, submitAnalysisResult, type DesktopSyncState } from "./spacetimeBridge";

type Tab = "monitor" | "cameras" | "analysis" | "governance";
type OnvifDevice = { endpoint: string; address: string; scopes: string[] };
type RtspProbe = { endpoint: string; host: string; port: number; connected: boolean; latencyMillis: number; error?: string };
type RtspCapture = { sessionId: string; cameraName: string; directory: string; startedAt: string };
type BiometricControls = { faceRecognitionEnabled: boolean; emotionalSignalEnabled: boolean; explicitConsentRecorded: boolean; humanReviewRequired: boolean; retentionDays: number };
type Capability = { key: string; title: string; category: string; requiresConsent: boolean; modelStatus: string; reviewRequired: boolean };

const initialControls: BiometricControls = { faceRecognitionEnabled: false, emotionalSignalEnabled: false, explicitConsentRecorded: false, humanReviewRequired: true, retentionDays: 7 };
const initialSync: DesktopSyncState = { connected: false, analysisEvents: 0, pendingReviews: 0, auditRecords: 0, queue: [], cameras: [], reason: "conectando à instância local" };

export default function DesktopApp() {
  const [tab, setTab] = useState<Tab>("monitor");
  const [rtsp, setRtsp] = useState("rtsp://192.168.1.100:554/stream1");
  const [devices, setDevices] = useState<OnvifDevice[]>([]);
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
  useEffect(() => startDesktopSpacetimeBridge(setSync), []);
  useEffect(() => { if (!analysisCameraId && sync.cameras.length) setAnalysisCameraId(sync.cameras[0].id); }, [analysisCameraId, sync.cameras]);
  const protectedCount = useMemo(() => capabilities.filter((capability) => capability.requiresConsent).length, [capabilities]);

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
      {([ ["monitor", "Operação"], ["cameras", "Câmeras"], ["analysis", "Análise"], ["governance", "Governança"] ] as [Tab, string][]).map(([key, label]) => <button className={tab === key ? "nav active" : "nav"} key={key} onClick={() => setTab(key)}>{label}</button>)}
      <footer><span>{sync.connected ? "SpacetimeDB conectado" : "SpacetimeDB local"}</span><small>{sync.connected ? `${sync.pendingReviews} revisão(ões) pendente(s)` : sync.reason}</small></footer>
    </aside>
    <section className="desktop-main">
      <header><div><p>OPERAÇÃO LOCAL</p><h1>{tab === "monitor" ? "Central de borda" : tab === "cameras" ? "Descoberta e conectividade" : tab === "analysis" ? "Análise de vídeo" : "Controles sensíveis"}</h1></div><div className="status-chip">● {sync.connected ? "SpacetimeDB reativo" : "processamento local"}</div></header>
      <div className="notice">{notice}</div>
      {tab === "monitor" && <div className="monitor-grid"><section className="video-stage"><span>CAM 01 · ENTRADA PRINCIPAL</span><div className="scanline"/><p>RTSP/ONVIF · stream local · sem upload de vídeo bruto</p></section><section className="system-card"><h2>Encaminhamento de eventos</h2><dl><div><dt>Eventos analíticos</dt><dd>{sync.analysisEvents} no SpacetimeDB</dd></div><div><dt>Revisões pendentes</dt><dd>{sync.pendingReviews} obrigatória(s)</dd></div><div><dt>Registros de auditoria</dt><dd>{sync.auditRecords} metadados</dd></div></dl></section></div>}
      {tab === "cameras" && <div className="columns"><section className="panel"><h2>Descobrir ONVIF</h2><p>Pesquisa WS-Discovery no multicast local. Câmeras em redes isoladas podem exigir descoberta manual.</p><button className="primary" onClick={() => void discover()}>Procurar dispositivos</button><div className="device-list">{devices.length ? devices.map((device) => <article key={device.endpoint}><strong>{device.address}</strong><span>{device.endpoint}</span></article>) : <em>Nenhuma câmera descoberta nesta sessão.</em>}</div></section><section className="panel"><h2>RTSP: diagnóstico e captura</h2><label>Endpoint RTSP<input value={rtsp} onChange={(event) => setRtsp(event.target.value)} /></label><button className="primary" onClick={() => void checkRtsp()}>Testar conectividade</button>{capture ? <button className="primary" onClick={() => void stopCapture()}>Parar captura</button> : <button className="primary" onClick={() => void startCapture()}>Iniciar captura local</button>}{probe && <div className={probe.connected ? "probe ok" : "probe fail"}><strong>{probe.connected ? "Acessível" : "Indisponível"}</strong><span>{probe.host}:{probe.port} · {probe.latencyMillis} ms</span></div>}{capture && <div className="probe ok"><strong>Gravando segmentos</strong><span>{capture.directory}</span></div>}</section></div>}
      {tab === "analysis" && <div className="analysis-grid">{capabilities.map((capability) => <article className="capability" key={capability.key}><div><small>{capability.category}</small><h2>{capability.title}</h2></div><p>{capability.modelStatus}</p><span className={capability.requiresConsent ? "guard" : "ready"}>{capability.requiresConsent ? "Consentimento + revisão" : "Modelo local configurável"}</span></article>)}<section className="panel pipeline"><h2>Executar análise local</h2><p>Informe um frame local para OCR, anomalia e modelos aprovados. Vídeo bruto permanece no dispositivo.</p><label>Câmera de origem<select value={analysisCameraId} onChange={(event) => setAnalysisCameraId(Number(event.target.value))}><option value={0}>Selecione uma câmera</option>{sync.cameras.map((camera) => <option value={camera.id} key={camera.id}>{camera.name}</option>)}</select></label><label>Caminho local do frame<input value={imagePath} placeholder="/dados/camera/frame.jpg" onChange={(event) => setImagePath(event.target.value)} /></label><button className="primary" onClick={() => void runLocalAnalysis()}>Analisar e encaminhar metadados</button>{analysisResult && <p>{analysisResult.results?.length ?? 0} resultado(s) processado(s); {analysisResult.blocked?.length ?? 0} fluxo(s) bloqueado(s) por política.</p>}</section><section className="panel pipeline"><h2>Fila de revisão</h2><p>Frame local → análise por modelo registrado → evento com confiança → fila de revisão → sincronização de metadados. O desktop não envia vídeo bruto ao SpacetimeDB por padrão.</p>{sync.connected && <div className="device-list">{sync.queue.length ? sync.queue.map((item) => <article key={item.id}><strong>{item.task} · {item.classification} · {item.confidence}</strong><span>Câmera #{item.cameraId} · {item.biometric ? "biometria: consentimento e revisão obrigatórios" : "revisão humana pendente"}</span><div><button className="primary" onClick={() => void review(item.id, "approved")}>Aprovar</button><button className="primary" onClick={() => void review(item.id, "rejected")}>Rejeitar</button></div></article>) : <em>Não há itens pendentes de revisão.</em>}</div>}</section></div>}
      {tab === "governance" && <section className="governance"><div className="panel"><h2>Dados biométricos e sinais emocionais</h2><p>Esses recursos são desativados inicialmente. Ative apenas após definir propósito legítimo, aviso apropriado, consentimento quando aplicável e processo de revisão humana.</p><label className="switch"><input type="checkbox" checked={controls.explicitConsentRecorded} onChange={(event) => setControls({ ...controls, explicitConsentRecorded: event.target.checked })} /><span />Consentimento ou fundamento autorizado registrado</label><label className="switch"><input type="checkbox" checked={controls.faceRecognitionEnabled} disabled={!controls.explicitConsentRecorded} onChange={(event) => setControls({ ...controls, faceRecognitionEnabled: event.target.checked })} /><span />Permitir comparação facial local</label><label className="switch"><input type="checkbox" checked={controls.emotionalSignalEnabled} disabled={!controls.explicitConsentRecorded} onChange={(event) => setControls({ ...controls, emotionalSignalEnabled: event.target.checked })} /><span />Permitir sinais emocionais como hipótese de alerta</label><label>Dias máximos de retenção<input type="number" min="1" max="30" value={controls.retentionDays} onChange={(event) => setControls({ ...controls, retentionDays: Number(event.target.value) })} /></label><button className="primary" onClick={() => void saveControls()}>Salvar política local</button></div><aside className="review-card"><strong>{protectedCount} fluxos protegidos</strong><p>O sistema não toma decisões disciplinares, de acesso ou de segurança exclusivamente com reconhecimento facial ou estimativa emocional.</p><span>Auditoria obrigatória</span></aside></section>}
    </section>
  </main>;
}
