import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import {
  Activity, AlertTriangle, BellRing, Camera as CameraIcon, ChevronDown, CircleDotDashed,
  Clock3, Download, FileText, Gauge, Grid2X2, LayoutGrid, ListFilter, Maximize2,
  MoreHorizontal, Pause, Play, Plus, Radio, Search, Settings2, ShieldCheck,
  SlidersHorizontal, Square, Volume2, Wifi, X,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { can, filterEvents } from "@/lib/cctv/access";
import { guardCommands } from "@/lib/cctv/roleGuard";
import { useCctv } from "@/lib/cctv/useCctv";
import { buildCsvContent, buildPdfRows } from "@/lib/cctv/reporting";
import type { Camera, CameraInput, EventFilters, Installation, InstallationInput, OperationalCapability, RetentionPolicy, SystemEvent, UserRole } from "@/lib/cctv/types";
import { CctvFrame } from "./CctvFrame";

type Screen = "monitor" | "events" | "cameras" | "config" | "reports";
type GridSize = 1 | 4 | 9 | 16;

const screenLabels: Record<Screen, string> = {
  monitor: "Monitoramento",
  events: "Central de eventos",
  cameras: "Câmeras",
  config: "Configuração",
  reports: "Relatórios",
};

const nav: { key: Screen; label: string; icon: typeof LayoutGrid; capability?: OperationalCapability }[] = [
  { key: "monitor", label: "Monitoramento", icon: LayoutGrid },
  { key: "events", label: "Eventos", icon: BellRing },
  { key: "cameras", label: "Câmeras", icon: CameraIcon, capability: "manage_cameras" },
  { key: "config", label: "Configurações", icon: Settings2, capability: "manage_retention" },
  { key: "reports", label: "Relatórios", icon: FileText, capability: "export" },
];

const initialFilters: EventFilters = { cameraId: "all", eventType: "all", from: "", to: "" };

function formatTime(value: number) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value);
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(value);
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function severityLabel(severity: SystemEvent["severity"]) {
  return { critical: "Crítico", warning: "Atenção", info: "Informativo" }[severity];
}

function exportCsv(events: SystemEvent[], cameras: Camera[]) {
  const csv = buildCsvContent(events, cameras);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `spacevision-ocorrencias-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportPdf(events: SystemEvent[], cameras: Camera[], filters: EventFilters) {
  const cameraName = new Map(cameras.map((camera) => [camera.id, camera.name]));
  const reportRows = buildPdfRows(events, cameras);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFillColor(11, 27, 31);
  doc.rect(0, 0, 595, 84, "F");
  doc.setTextColor(237, 246, 243);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("SPACEVISION  /  RELATÓRIO DE OCORRÊNCIAS", 40, 46);
  doc.setTextColor(47, 62, 64);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const description = `Filtros: câmera ${filters.cameraId === "all" ? "todas" : cameraName.get(Number(filters.cameraId)) ?? "-"}; tipo ${filters.eventType}; período ${filters.from || "início"} a ${filters.to || "agora"}.`;
  doc.text(doc.splitTextToSize(description, 510), 40, 108);
  let y = 142;
  reportRows.forEach((event, index) => {
    if (y > 745) { doc.addPage(); y = 48; }
    doc.setDrawColor(220, 228, 225);
    doc.line(40, y + 38, 555, y + 38);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(event.severity === "critical" ? 169 : event.severity === "warning" ? 166 : 46, event.severity === "critical" ? 54 : event.severity === "warning" ? 104 : 100, event.severity === "critical" ? 47 : event.severity === "warning" ? 47 : 87);
    doc.text(`${event.severityLabel.toUpperCase()} · ${event.type.toUpperCase()}`, 40, y);
    doc.setTextColor(47, 62, 64);
    doc.setFont("helvetica", "normal");
    doc.text(`${event.occurredAtLabel}  •  ${event.cameraName}`, 40, y + 15);
    doc.text(doc.splitTextToSize(event.message, 445), 40, y + 29);
    y += index === events.length - 1 ? 50 : 54;
  });
  doc.save(`spacevision-ocorrencias-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function EventMark({ event }: { event: SystemEvent }) {
  return <span className={`severity-dot ${event.severity}`} aria-label={severityLabel(event.severity)} />;
}

export default function CctvConsole() {
  const { user, isAuthenticated, loading } = useAuth();
  const requestedRole = String(user?.role ?? "viewer");
  const role: UserRole = ["admin", "operator", "auditor", "technician", "viewer"].includes(requestedRole) ? requestedRole as UserRole : "viewer";
  const canManageCameras = can(role, "manage_cameras");
  const canManageRetention = can(role, "manage_retention");
  const canAcknowledge = can(role, "acknowledge");
  const canExport = can(role, "export");
  const { snapshot, commands } = useCctv();
  const [screen, setScreen] = useState<Screen>("monitor");
  const [grid, setGrid] = useState<GridSize>(4);
  const [selectedCameraId, setSelectedCameraId] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(36);
  const [filters, setFilters] = useState<EventFilters>(initialFilters);
  const [cameraModal, setCameraModal] = useState<Camera | "new" | null>(null);
  const [installationModal, setInstallationModal] = useState<Installation | "new" | null>(null);
  const [selectedInstallationId, setSelectedInstallationId] = useState(0);
  const [retentionCamera, setRetentionCamera] = useState(1);
  const protectedCommands = useMemo(() => guardCommands(role, commands), [role, commands]);

  useEffect(() => {
    if ((screen === "cameras" && !canManageCameras) || (screen === "config" && !canManageRetention) || (screen === "reports" && !canExport)) setScreen("monitor");
  }, [canExport, canManageCameras, canManageRetention, screen]);

  useEffect(() => {
    if (!selectedInstallationId && snapshot.installations.length) setSelectedInstallationId(snapshot.installations[0].id);
  }, [selectedInstallationId, snapshot.installations]);

  useEffect(() => {
    if (!playing) return;
    const interval = window.setInterval(() => setProgress((value) => value >= 100 ? 0 : value + 0.25), 180);
    return () => window.clearInterval(interval);
  }, [playing]);

  const selectedInstallation = snapshot.installations.find((installation) => installation.id === selectedInstallationId) ?? snapshot.installations[0];
  const scopedCameras = snapshot.cameras.filter((camera) => camera.installationId === selectedInstallation?.id);
  const scopedCameraIds = useMemo(() => new Set(scopedCameras.map((camera) => camera.id)), [scopedCameras]);
  const selectedCamera = scopedCameras.find((camera) => camera.id === selectedCameraId) ?? scopedCameras[0];
  const activeCameras = scopedCameras.filter((camera) => camera.status === "online").length;
  const scopedEvents = snapshot.events.filter((event) => event.cameraId === null || scopedCameraIds.has(event.cameraId));
  const filteredEvents = useMemo(() => filterEvents(scopedEvents, filters), [scopedEvents, filters]);
  const displayedCameras = Array.from({ length: grid }, (_, index) => scopedCameras[index % Math.max(scopedCameras.length, 1)]).filter(Boolean);
  const activityData = useMemo(() => Array.from({ length: 12 }, (_, index) => ({
    label: `${String(index + 8).padStart(2, "0")}h`,
    value: 12 + ((index * 17 + snapshot.events.length * 8) % 51),
  })), [snapshot.events.length]);

  if (loading) return <div className="auth-shell"><div className="auth-card"><Radio className="pulse-icon" /><p>Conectando à central segura...</p></div></div>;

  return (
    <div className="cctv-shell">
      <aside className="cctv-sidebar">
        <div className="brand-lockup"><span className="brand-orbit"><CircleDotDashed /></span><div><strong>SPACEVISION</strong><small>DVR / SECURITY OS</small></div></div>
        <div className="site-chip"><span className={`status-pip ${selectedInstallation?.status === "active" ? "online" : "warn"}`} /><div><select aria-label="Alternar instalação" value={selectedInstallation?.id ?? 0} onChange={(event) => setSelectedInstallationId(Number(event.target.value))}>{snapshot.installations.map((installation) => <option value={installation.id} key={installation.id}>{installation.name}</option>)}</select><small>{selectedInstallation?.location ?? "Modo de demonstração"}</small></div><ChevronDown size={15} /></div>
        <nav className="side-nav" aria-label="Navegação principal">
          <span className="nav-caption">OPERAÇÃO</span>
          {nav.map((item) => {
            if (item.capability && !can(role, item.capability)) return null;
            const Icon = item.icon;
            return <button type="button" key={item.key} className={screen === item.key ? "active" : ""} onClick={() => setScreen(item.key)}><Icon size={17} /><span>{item.label}</span>{item.key === "events" && scopedEvents.filter((event) => !event.acknowledged).length > 0 && <i>{scopedEvents.filter((event) => !event.acknowledged).length}</i>}</button>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="realtime-state"><span className={snapshot.connected ? "status-pip online" : "status-pip warn"} />{snapshot.source === "spacetimedb" ? "Sincronização SpacetimeDB" : "Simulador local reativo"}</div>
          <div className="profile-tile"><div className="profile-avatar">{(user?.name ?? "V").slice(0, 1).toUpperCase()}</div><div><strong>{user?.name ?? "Visitante"}</strong><small>{role}</small></div>{!isAuthenticated && <button type="button" onClick={() => startLogin()} title="Entrar"><ShieldCheck size={16} /></button>}</div>
        </div>
      </aside>

      <main className="cctv-main">
        <header className="topbar">
          <div><span className="eyebrow">CENTRO DE CONTROLE</span><h1>{screenLabels[screen]}</h1></div>
          <div className="top-actions"><button type="button" className="icon-button" aria-label="Pesquisar"><Search size={18} /></button><button type="button" className="icon-button notification" aria-label="Notificações"><BellRing size={18} /><i /></button><div className="date-chip"><Clock3 size={15} />{new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).format(new Date())}</div></div>
        </header>

        {screen === "monitor" && <MonitorScreen cameras={displayedCameras} selectedCamera={selectedCamera} grid={grid} onGrid={setGrid} onSelect={setSelectedCameraId} events={scopedEvents} recordings={snapshot.recordings} playing={playing} progress={progress} onPlay={() => setPlaying((value) => !value)} onProgress={setProgress} />}
        {screen === "events" && <EventsScreen cameras={scopedCameras} events={filteredEvents} filters={filters} onFilters={setFilters} onAcknowledge={protectedCommands.acknowledgeEvent} canAcknowledge={canAcknowledge} />}
        {screen === "cameras" && canManageCameras && <CamerasScreen cameras={scopedCameras} health={snapshot.cameraHealth} onEdit={setCameraModal} onManageInstallation={() => setInstallationModal(selectedInstallation ?? "new")} onStatus={protectedCommands.setCameraStatus} />}
        {screen === "config" && canManageRetention && <ConfigurationScreen cameras={scopedCameras} policies={snapshot.retentionPolicies} selectedCameraId={retentionCamera} onSelect={setRetentionCamera} onSave={protectedCommands.setRetention} />}
        {screen === "reports" && canExport && <ReportsScreen cameras={scopedCameras} events={filteredEvents} filters={filters} onFilters={setFilters} onCsv={() => exportCsv(filteredEvents, scopedCameras)} onPdf={() => exportPdf(filteredEvents, scopedCameras, filters)} />}

        <section className="system-strip" aria-label="Indicadores do sistema">
          <Metric icon={CameraIcon} label="Câmeras ativas" value={`${activeCameras}/${scopedCameras.length}`} detail="feeds disponíveis no local" tone="mint" />
          <Metric icon={Gauge} label="Armazenamento" value={`${snapshot.storageUsedPercent}%`} detail="5,9 TB de 8 TB" tone="amber" />
          <Metric icon={Activity} label="Uptime da central" value={formatDuration(snapshot.uptimeSeconds)} detail="serviços estáveis" tone="blue" />
          <div className="metric-card chart-metric"><div><span>Atividade nas últimas 12h</span><strong>+18,4%</strong></div><div className="tiny-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={activityData}><defs><linearGradient id="activity-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#89e8c3" stopOpacity="0.45"/><stop offset="100%" stopColor="#89e8c3" stopOpacity="0"/></linearGradient></defs><XAxis dataKey="label" hide /><Tooltip contentStyle={{ background: "#13272b", border: "0", color: "#e9f4ef" }} labelStyle={{ display: "none" }} /><Area dataKey="value" stroke="#8ce7c7" strokeWidth={2} fill="url(#activity-fill)" /></AreaChart></ResponsiveContainer></div></div>
        </section>
      </main>
      {cameraModal && <CameraModal camera={cameraModal === "new" ? undefined : cameraModal} installations={snapshot.installations} onClose={() => setCameraModal(null)} onSave={async (input) => { await protectedCommands.upsertCamera(input); setCameraModal(null); }} />}
      {installationModal && <InstallationModal installation={installationModal === "new" ? undefined : installationModal} onClose={() => setInstallationModal(null)} onSave={async (input) => { await protectedCommands.upsertInstallation(input); setInstallationModal(null); }} />}
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: typeof CameraIcon; label: string; value: string; detail: string; tone: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>;
}

function MonitorScreen({ cameras, selectedCamera, grid, onGrid, onSelect, events, recordings, playing, progress, onPlay, onProgress }: { cameras: Camera[]; selectedCamera?: Camera; grid: GridSize; onGrid: (value: GridSize) => void; onSelect: (id: number) => void; events: SystemEvent[]; recordings: { id: number; cameraId: number; startedAt: number; durationSeconds: number; hasMotion: boolean; quality: string }[]; playing: boolean; progress: number; onPlay: () => void; onProgress: (value: number) => void }) {
  const currentRecordings = recordings.filter((recording) => recording.cameraId === selectedCamera?.id).slice(0, 6);
  return <div className="monitor-layout">
    <section className="monitor-panel panel-surface">
      <div className="panel-header"><div><h2>Visão ao vivo</h2><span>{cameras.length} feeds em exibição · atualização contínua</span></div><div className="grid-picker" aria-label="Escolher grade">{([1, 4, 9, 16] as GridSize[]).map((option) => <button type="button" className={grid === option ? "selected" : ""} onClick={() => onGrid(option)} key={option} title={`Grade ${option === 1 ? "1×1" : `${Math.sqrt(option)}×${Math.sqrt(option)}`}`}>{option === 1 ? <Square size={15} /> : option === 4 ? <Grid2X2 size={15} /> : <LayoutGrid size={15} />}</button>)}</div></div>
      <div className={`camera-grid grid-${grid}`}>{cameras.map((camera, index) => <CctvFrame key={`${camera.id}-${index}`} camera={camera} compact={grid > 4} onClick={() => onSelect(camera.id)} />)}</div>
    </section>
    <aside className="monitor-rail">
      <section className="panel-surface focus-card">
        <div className="focus-label"><span><Radio size={14} /> EM FOCO</span><MoreHorizontal size={17} /></div>
        {selectedCamera && <><CctvFrame camera={selectedCamera} /><div className="focus-meta"><div><h3>{selectedCamera.name}</h3><span>{selectedCamera.location}</span></div><span className={`camera-status ${selectedCamera.status}`}>{selectedCamera.status === "online" ? "Online" : "Offline"}</span></div></>}
      </section>
      <section className="panel-surface timeline-card"><div className="section-title"><div><h2>Linha do tempo</h2><span>Gravações simuladas</span></div><span>{selectedCamera?.name}</span></div><div className="timeline-scale"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>agora</span></div><div className="timeline-bar">{currentRecordings.map((recording, index) => <button key={recording.id} type="button" className={recording.hasMotion ? "motion-segment" : "record-segment"} style={{ left: `${index * 16 + 2}%`, width: `${recording.hasMotion ? 11 : 14}%` }} title={`${recording.quality} · ${formatTime(recording.startedAt)}`} />)}<span className="timeline-cursor" style={{ left: `${progress}%` }} /></div><input aria-label="Posição de playback" className="seek-input" type="range" min="0" max="100" step="0.1" value={progress} onChange={(event) => onProgress(Number(event.target.value))} /><div className="playback-controls"><button type="button" onClick={onPlay}>{playing ? <Pause size={15} /> : <Play size={15} />}</button><button type="button"><Volume2 size={15} /></button><span>{formatDuration(Math.round(progress * 5.4))} / 09:00:00</span><button type="button"><Maximize2 size={15} /></button></div></section>
      <section className="panel-surface mini-event-list"><div className="section-title"><h2>Últimos alertas</h2><span>{events.length}</span></div>{events.slice(0, 3).map((event) => <div className="event-row" key={event.id}><EventMark event={event} /><div><strong>{event.message}</strong><span>{formatTime(event.occurredAt)} · {severityLabel(event.severity)}</span></div></div>)}</section>
    </aside>
  </div>;
}

function FilterBar({ cameras, filters, onFilters }: { cameras: Camera[]; filters: EventFilters; onFilters: (filters: EventFilters) => void }) {
  return <div className="filter-bar"><ListFilter size={16} /><select value={filters.cameraId} onChange={(event) => onFilters({ ...filters, cameraId: event.target.value })}><option value="all">Todas as câmeras</option>{cameras.map((camera) => <option value={camera.id} key={camera.id}>{camera.name}</option>)}</select><select value={filters.eventType} onChange={(event) => onFilters({ ...filters, eventType: event.target.value as EventFilters["eventType"] })}><option value="all">Todos os eventos</option><option value="motion">Movimento</option><option value="offline">Câmera offline</option><option value="storage">Armazenamento</option></select><input type="date" aria-label="Data inicial" value={filters.from} onChange={(event) => onFilters({ ...filters, from: event.target.value })} /><input type="date" aria-label="Data final" value={filters.to} onChange={(event) => onFilters({ ...filters, to: event.target.value })} /><button type="button" onClick={() => onFilters(initialFilters)}>Limpar</button></div>;
}

function EventsScreen({ cameras, events, filters, onFilters, onAcknowledge, canAcknowledge }: { cameras: Camera[]; events: SystemEvent[]; filters: EventFilters; onFilters: (filters: EventFilters) => void; onAcknowledge: (id: number) => Promise<void>; canAcknowledge: boolean }) {
  return <section className="panel-surface content-surface"><div className="section-title spread"><div><h2>Eventos e alertas</h2><span>Registro reativo de ocorrências do sistema</span></div><span className="result-count">{events.length} resultados</span></div><FilterBar cameras={cameras} filters={filters} onFilters={onFilters} /><div className="events-table">{events.length ? events.map((event) => <article key={event.id}><EventMark event={event} /><div className="event-info"><strong>{event.message}</strong><span>{event.cameraId ? cameras.find((camera) => camera.id === event.cameraId)?.name ?? "Câmera" : "Sistema"} · {formatDateTime(event.occurredAt)}</span></div><span className={`severity-badge ${event.severity}`}>{severityLabel(event.severity)}</span>{canAcknowledge && !event.acknowledged ? <button type="button" onClick={() => void onAcknowledge(event.id)}>Reconhecer</button> : <span className="acknowledged">{event.acknowledged ? "Reconhecido" : "Somente leitura"}</span>}</article>) : <div className="empty-state"><BellRing size={24} /><p>Nenhuma ocorrência corresponde aos filtros selecionados.</p></div>}</div></section>;
}

function CamerasScreen({ cameras, health, onEdit, onManageInstallation, onStatus }: { cameras: Camera[]; health: import("@/lib/cctv/types").CameraHealth[]; onEdit: (camera: Camera | "new") => void; onManageInstallation: () => void; onStatus: (id: number, status: Camera["status"]) => Promise<void> }) {
  const [zone, setZone] = useState("all");
  const zones = Array.from(new Set(cameras.map((camera) => camera.zone)));
  const listedCameras = zone === "all" ? cameras : cameras.filter((camera) => camera.zone === zone);
  return <section className="panel-surface content-surface"><div className="section-title spread"><div><h2>Inventário de câmeras</h2><span>Gerencie as fontes, etiquetas, saúde e manutenção preventiva.</span></div><div><button type="button" className="soft-button" onClick={onManageInstallation}>Editar instalação</button><button type="button" className="primary-button" onClick={() => onEdit("new")}><Plus size={16} />Adicionar câmera</button></div></div><div className="camera-zone-filter"><span>Grupo / zona</span><div><button type="button" className={zone === "all" ? "active" : ""} onClick={() => setZone("all")}>Todas</button>{zones.map((item) => <button type="button" className={zone === item ? "active" : ""} key={item} onClick={() => setZone(item)}>{item}</button>)}</div></div><div className="camera-list">{listedCameras.map((camera) => { const condition = health.find((item) => item.cameraId === camera.id); return <article key={camera.id}><div className={`camera-glyph ${camera.status}`}><CameraIcon size={18} /></div><div className="camera-list-main"><strong>{camera.name}</strong><span>{camera.location} · {camera.zone} · {camera.protocol}</span><span>Etiquetas: {camera.tags || "sem etiquetas"} · {condition?.consecutiveFailures ? `${condition.consecutiveFailures} falha(s) consecutiva(s)` : "saudável"}{condition?.maintenanceNote ? ` · ${condition.maintenanceNote}` : ""}</span></div><span className={`camera-status ${camera.status}`}>{camera.status}</span><button type="button" className="soft-button" onClick={() => void onStatus(camera.id, camera.status === "online" ? "offline" : "online")}>{camera.status === "online" ? "Desativar" : "Reativar"}</button><button type="button" className="icon-button" onClick={() => onEdit(camera)}><Settings2 size={16} /></button></article>; })}</div></section>;
}

function ConfigurationScreen({ cameras, policies, selectedCameraId, onSelect, onSave }: { cameras: Camera[]; policies: RetentionPolicy[]; selectedCameraId: number; onSelect: (id: number) => void; onSave: (policy: RetentionPolicy) => Promise<void> }) {
  const policy = policies.find((item) => item.cameraId === selectedCameraId) ?? { cameraId: selectedCameraId, retentionDays: 30, quality: "1080p" as const, recordingMode: "continuous" as const };
  const [draft, setDraft] = useState(policy);
  useEffect(() => setDraft(policy), [policy.cameraId, policy.quality, policy.recordingMode, policy.retentionDays]);
  return <section className="panel-surface content-surface configuration"><div className="section-title"><div><h2>Retenção e qualidade</h2><span>As alterações são restritas a operadores administradores.</span></div></div><div className="config-grid"><label><span>Câmera</span><select value={selectedCameraId} onChange={(event) => onSelect(Number(event.target.value))}>{cameras.map((camera) => <option value={camera.id} key={camera.id}>{camera.name}</option>)}</select></label><label><span>Dias de retenção</span><input type="number" min="1" max="365" value={draft.retentionDays} onChange={(event) => setDraft({ ...draft, retentionDays: Number(event.target.value) })} /></label><label><span>Qualidade de gravação</span><select value={draft.quality} onChange={(event) => setDraft({ ...draft, quality: event.target.value as RetentionPolicy["quality"] })}><option>720p</option><option>1080p</option><option>4K</option></select></label><label><span>Agendamento</span><select value={draft.recordingMode} onChange={(event) => setDraft({ ...draft, recordingMode: event.target.value as RetentionPolicy["recordingMode"] })}><option value="continuous">Gravação contínua</option><option value="motion">Somente movimento</option></select></label></div><div className="policy-note"><ShieldCheck size={20} /><p>O modo <strong>{draft.recordingMode === "continuous" ? "contínuo" : "por movimento"}</strong> será aplicado à câmera selecionada e refletido pela assinatura reativa quando o módulo SpacetimeDB estiver conectado.</p></div><button type="button" className="primary-button" onClick={() => void onSave(draft)}><SlidersHorizontal size={16} />Salvar política</button></section>;
}

function ReportsScreen({ cameras, events, filters, onFilters, onCsv, onPdf }: { cameras: Camera[]; events: SystemEvent[]; filters: EventFilters; onFilters: (filters: EventFilters) => void; onCsv: () => void; onPdf: () => void }) {
  return <section className="panel-surface content-surface"><div className="section-title spread"><div><h2>Exportar ocorrências</h2><span>O arquivo reflete somente os eventos correspondentes aos filtros abaixo.</span></div><span className="result-count">{events.length} itens selecionados</span></div><FilterBar cameras={cameras} filters={filters} onFilters={onFilters} /><div className="report-preview"><div><FileText size={24} /><strong>Relatório de ocorrências</strong><span>Inclui tipo, severidade, câmera, data e status de reconhecimento.</span></div><div className="report-actions"><button type="button" className="soft-button" onClick={onCsv}><Download size={16} />CSV</button><button type="button" className="primary-button" onClick={onPdf}><FileText size={16} />PDF</button></div></div></section>;
}

function CameraModal({ camera, installations, onClose, onSave }: { camera?: Camera; installations: import("@/lib/cctv/types").Installation[]; onClose: () => void; onSave: (input: CameraInput & { id?: number }) => Promise<void> }) {
  const [draft, setDraft] = useState<CameraInput>({ installationId: camera?.installationId ?? 1, name: camera?.name ?? "", location: camera?.location ?? "", zone: camera?.zone ?? "", tags: camera?.tags ?? "", protocol: "RTSP", streamUrl: camera?.streamUrl ?? "rtsp://", status: camera?.status ?? "online" });
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label={camera ? "Editar câmera" : "Adicionar câmera"}><form className="camera-modal" onSubmit={(event) => { event.preventDefault(); void onSave({ ...draft, id: camera?.id }); }}><div className="modal-header"><div><span className="eyebrow">GERENCIAMENTO</span><h2>{camera ? "Editar câmera" : "Nova câmera"}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="form-grid"><label><span>Instalação</span><select value={draft.installationId} onChange={(event) => setDraft({ ...draft, installationId: Number(event.target.value) })}>{installations.map((installation) => <option value={installation.id} key={installation.id}>{installation.name}</option>)}</select></label><label><span>Nome</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ex.: Entrada principal" /></label><label><span>Localização</span><input required value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Ex.: Portaria norte" /></label><label><span>Grupo / zona</span><input required value={draft.zone} onChange={(event) => setDraft({ ...draft, zone: event.target.value })} placeholder="Ex.: Acesso" /></label><label><span>Etiquetas</span><input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="acesso, perímetro" /></label><label><span>Estado</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Camera["status"] })}><option value="online">Online</option><option value="offline">Offline</option></select></label><label className="wide"><span>Endpoint RTSP <em>placeholder</em></span><input required value={draft.streamUrl} onChange={(event) => setDraft({ ...draft, streamUrl: event.target.value })} /></label></div><div className="modal-actions"><button type="button" className="soft-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button">{camera ? "Salvar alterações" : "Criar câmera"}</button></div></form></div>;
}

function InstallationModal({ installation, onClose, onSave }: { installation?: Installation; onClose: () => void; onSave: (input: InstallationInput & { id?: number }) => Promise<void> }) {
  const [draft, setDraft] = useState<InstallationInput>({ name: installation?.name ?? "", location: installation?.location ?? "", timezone: installation?.timezone ?? "America/Sao_Paulo", status: installation?.status ?? "active" });
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Editar instalação"><form className="camera-modal" onSubmit={(event) => { event.preventDefault(); void onSave({ ...draft, id: installation?.id }); }}><div className="modal-header"><div><span className="eyebrow">MULTI-INSTALAÇÃO</span><h2>{installation ? "Editar instalação" : "Nova instalação"}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="form-grid"><label><span>Nome</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label><span>Localização</span><input required value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label><label><span>Fuso horário</span><input required value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })} /></label><label><span>Estado</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as InstallationInput["status"] })}><option value="active">Ativa</option><option value="maintenance">Manutenção</option><option value="inactive">Inativa</option></select></label></div><div className="modal-actions"><button type="button" className="soft-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button">Salvar instalação</button></div></form></div>;
}
