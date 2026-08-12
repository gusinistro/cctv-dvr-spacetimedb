import type {
  Camera,
  CameraInput,
  CameraStatus,
  CctvStore,
  RetentionPolicy,
  SystemEvent,
  SystemSnapshot,
} from "./types";

const now = Date.now();

const baseCameras: Camera[] = [
  { id: 1, installationId: 1, name: "Entrada principal", location: "Portaria norte", zone: "Acesso", tags: "acesso,perímetro", protocol: "RTSP", streamUrl: "rtsp://simulado/entrada", status: "online", motion: false, scene: "day" },
  { id: 2, installationId: 1, name: "Recepção", location: "Bloco administrativo", zone: "Lobby", tags: "público,atendimento", protocol: "RTSP", streamUrl: "rtsp://simulado/recepcao", status: "online", motion: true, scene: "day" },
  { id: 3, installationId: 1, name: "Pátio logístico", location: "Docas 01–04", zone: "Operação", tags: "logística,docas", protocol: "RTSP", streamUrl: "rtsp://simulado/patio", status: "online", motion: false, scene: "day" },
  { id: 4, installationId: 1, name: "Corredor leste", location: "Nível 2", zone: "Interno", tags: "interno,rota", protocol: "RTSP", streamUrl: "rtsp://simulado/corredor", status: "online", motion: false, scene: "night" },
  { id: 5, installationId: 1, name: "Estacionamento", location: "Setor visitante", zone: "Externo", tags: "veículos,perímetro", protocol: "RTSP", streamUrl: "rtsp://simulado/estacionamento", status: "online", motion: true, scene: "night" },
  { id: 6, installationId: 1, name: "Sala de servidores", location: "Subsolo", zone: "Crítico", tags: "crítico,infraestrutura", protocol: "RTSP", streamUrl: "rtsp://simulado/servidores", status: "online", motion: false, scene: "night" },
  { id: 7, installationId: 1, name: "Saída de emergência", location: "Ala oeste", zone: "Acesso", tags: "emergência,rota", protocol: "RTSP", streamUrl: "rtsp://simulado/saida", status: "offline", motion: false, scene: "night" },
  { id: 8, installationId: 1, name: "Perímetro sul", location: "Cerca externa", zone: "Externo", tags: "perímetro,externo", protocol: "RTSP", streamUrl: "rtsp://simulado/perimetro", status: "online", motion: false, scene: "night" },
];

const baseEvents: SystemEvent[] = [
  { id: 101, cameraId: 2, type: "motion", severity: "warning", message: "Movimento identificado na recepção", occurredAt: now - 3 * 60_000, acknowledged: false },
  { id: 102, cameraId: 7, type: "offline", severity: "critical", message: "Câmera sem resposta há 12 minutos", occurredAt: now - 12 * 60_000, acknowledged: false },
  { id: 103, cameraId: 5, type: "motion", severity: "info", message: "Atividade no estacionamento", occurredAt: now - 19 * 60_000, acknowledged: true },
  { id: 104, cameraId: null, type: "storage", severity: "warning", message: "Armazenamento atingiu 76% da capacidade", occurredAt: now - 41 * 60_000, acknowledged: true },
];

export function createDemoStore(): CctvStore {
  const listeners = new Set<() => void>();
  let eventId = 200;
  let startedAt = Date.now();
  let snapshot: SystemSnapshot = {
    cameras: baseCameras,
    installations: [{ id: 1, name: "Instalação central", location: "São Paulo · BR", timezone: "America/Sao_Paulo", status: "active" }],
    cameraHealth: baseCameras.map((camera) => ({ cameraId: camera.id, consecutiveFailures: camera.status === "offline" ? 1 : 0, lastCheckedAt: now, lastSuccessAt: now, maintenanceNote: camera.status === "offline" ? "Inspeção preventiva solicitada" : "", maintenanceStatus: camera.status === "offline" ? "scheduled" as const : "none" as const })),
    evidenceRecords: [],
    recordings: baseCameras.flatMap((camera, cameraIndex) => Array.from({ length: 6 }, (_, index) => ({
      id: camera.id * 100 + index,
      cameraId: camera.id,
      startedAt: now - (index * 14 + cameraIndex * 3) * 60_000,
      durationSeconds: 720,
      hasMotion: index % 3 === 0,
      quality: camera.id === 6 ? "4K" : "1080p" as const,
    }))),
    events: baseEvents,
    retentionPolicies: baseCameras.map((camera) => ({
      cameraId: camera.id,
      retentionDays: camera.zone === "Crítico" ? 60 : 30,
      quality: camera.id === 6 ? "4K" : "1080p",
      recordingMode: camera.zone === "Acesso" ? "motion" : "continuous",
    })),
    connected: true,
    source: "demo",
    uptimeSeconds: 0,
    storageUsedPercent: 76,
    updatedAt: now,
  };

  const emit = () => {
    snapshot = { ...snapshot, updatedAt: Date.now(), uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000) };
    listeners.forEach((listener) => listener());
  };

  const log = (event: Omit<SystemEvent, "id" | "occurredAt" | "acknowledged">) => {
    snapshot = { ...snapshot, events: [{ ...event, id: eventId++, occurredAt: Date.now(), acknowledged: false }, ...snapshot.events].slice(0, 100) };
  };

  const heartbeat = globalThis.setInterval(() => {
    const online = snapshot.cameras.filter((camera) => camera.status === "online");
    const target = online[Math.floor(Math.random() * online.length)];
    if (!target) return;
    const motion = Math.random() > 0.62;
    snapshot = {
      ...snapshot,
      cameras: snapshot.cameras.map((camera) => camera.id === target.id
        ? { ...camera, motion, scene: new Date().getHours() >= 18 || new Date().getHours() < 6 ? "night" : "day" }
        : camera),
      storageUsedPercent: Math.min(92, snapshot.storageUsedPercent + (Math.random() > 0.7 ? 1 : 0)),
    };
    if (motion && Math.random() > 0.5) {
      log({ cameraId: target.id, type: "motion", severity: "info", message: `Movimento detectado em ${target.name}` });
    }
    emit();
  }, 2800);

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async upsertInstallation(input: import("./types").InstallationInput & { id?: number }) {
      const existing = input.id ? snapshot.installations.find((installation) => installation.id === input.id) : undefined;
      if (existing) snapshot = { ...snapshot, installations: snapshot.installations.map((installation) => installation.id === existing.id ? { ...existing, ...input } : installation) };
      else {
        const id = Math.max(...snapshot.installations.map((installation) => installation.id), 0) + 1;
        snapshot = { ...snapshot, installations: [...snapshot.installations, { ...input, id }] };
      }
      emit();
    },
    async upsertCamera(input: CameraInput & { id?: number }) {
      const existing = input.id ? snapshot.cameras.find((camera) => camera.id === input.id) : undefined;
      if (existing) {
        snapshot = { ...snapshot, cameras: snapshot.cameras.map((camera) => camera.id === existing.id ? { ...existing, ...input } : camera) };
      } else {
        const id = Math.max(...snapshot.cameras.map((camera) => camera.id), 0) + 1;
        snapshot = { ...snapshot, cameras: [...snapshot.cameras, { ...input, id, motion: false, scene: "day" }] };
        snapshot = { ...snapshot, retentionPolicies: [...snapshot.retentionPolicies, { cameraId: id, retentionDays: 30, quality: "1080p", recordingMode: "continuous" }] };
        snapshot = { ...snapshot, cameraHealth: [...snapshot.cameraHealth, { cameraId: id, consecutiveFailures: 0, lastCheckedAt: Date.now(), lastSuccessAt: Date.now(), maintenanceNote: "", maintenanceStatus: "none" }] };
      }
      emit();
    },
    async setRetention(policy: RetentionPolicy) {
      snapshot = { ...snapshot, retentionPolicies: snapshot.retentionPolicies.map((item) => item.cameraId === policy.cameraId ? policy : item) };
      emit();
    },
    async acknowledgeEvent(id: number) {
      snapshot = { ...snapshot, events: snapshot.events.map((event) => event.id === id ? { ...event, acknowledged: true } : event) };
      emit();
    },
    async setCameraStatus(id: number, status: CameraStatus) {
      const camera = snapshot.cameras.find((item) => item.id === id);
      snapshot = { ...snapshot, cameras: snapshot.cameras.map((item) => item.id === id ? { ...item, status } : item) };
      if (camera && status === "offline") log({ cameraId: id, type: "offline", severity: "critical", message: `${camera.name} ficou indisponível` });
      emit();
    },
    dispose() {
      globalThis.clearInterval(heartbeat);
      listeners.clear();
      startedAt = 0;
    },
  };
}
