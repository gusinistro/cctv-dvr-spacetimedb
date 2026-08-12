export type UserRole = "admin" | "operator" | "auditor" | "technician" | "viewer";
export type OperationalCapability = "live_view" | "export" | "acknowledge" | "review_analysis" | "manage_cameras" | "manage_retention" | "manage_roles" | "manage_biometrics" | "diagnostics";
export type CameraStatus = "online" | "offline";
export type EventType = "motion" | "offline" | "storage" | "health";
export type Severity = "critical" | "warning" | "info";
export type RecordingMode = "continuous" | "motion";

export type Camera = {
  id: number;
  installationId: number;
  name: string;
  location: string;
  zone: string;
  tags: string;
  protocol: "RTSP";
  streamUrl: string;
  status: CameraStatus;
  motion: boolean;
  scene: "day" | "night";
};

export type Installation = {
  id: number;
  name: string;
  location: string;
  timezone: string;
  status: "active" | "maintenance" | "inactive";
};

export type InstallationInput = Omit<Installation, "id">;

export type CameraHealth = {
  cameraId: number;
  consecutiveFailures: number;
  lastCheckedAt: number;
  lastSuccessAt: number;
  maintenanceNote: string;
  maintenanceStatus: "none" | "scheduled" | "in_progress" | "completed";
  maintenanceDueAt?: number;
};

export type MaintenanceStatus = CameraHealth["maintenanceStatus"];

export type EvidenceRecord = {
  id: number;
  analysisEventId: number;
  cameraId: number;
  evidenceRef: string;
  sha256: string;
  createdAt: number;
  exportedAt?: number;
  signedExportRef?: string;
  signatureAlgorithm?: string;
};

export type Recording = {
  id: number;
  cameraId: number;
  startedAt: number;
  durationSeconds: number;
  hasMotion: boolean;
  quality: "1080p" | "4K" | "720p";
};

export type SystemEvent = {
  id: number;
  cameraId: number | null;
  type: EventType;
  severity: Severity;
  message: string;
  occurredAt: number;
  acknowledged: boolean;
};

export type RetentionPolicy = {
  cameraId: number;
  retentionDays: number;
  quality: "1080p" | "4K" | "720p";
  recordingMode: RecordingMode;
};

export type SystemSnapshot = {
  installations: Installation[];
  cameras: Camera[];
  cameraHealth: CameraHealth[];
  evidenceRecords: EvidenceRecord[];
  recordings: Recording[];
  events: SystemEvent[];
  retentionPolicies: RetentionPolicy[];
  connected: boolean;
  source: "spacetimedb" | "demo";
  uptimeSeconds: number;
  storageUsedPercent: number;
  updatedAt: number;
};

export type EventFilters = {
  cameraId: string;
  eventType: "all" | EventType;
  from: string;
  to: string;
};

export type CameraInput = Omit<Camera, "id" | "motion" | "scene">;

export type CctvCommands = {
  upsertInstallation(input: InstallationInput & { id?: number }): Promise<void>;
  upsertCamera(input: CameraInput & { id?: number }): Promise<void>;
  reportCameraHealth(cameraId: number, success: boolean, maintenanceNote: string, maintenanceStatus: MaintenanceStatus): Promise<void>;
  setRetention(policy: RetentionPolicy): Promise<void>;
  acknowledgeEvent(id: number): Promise<void>;
  setCameraStatus(id: number, status: CameraStatus): Promise<void>;
};

export type CctvStore = CctvCommands & {
  getSnapshot(): SystemSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
};
