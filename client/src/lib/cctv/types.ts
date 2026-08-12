export type UserRole = "admin" | "viewer";
export type CameraStatus = "online" | "offline";
export type EventType = "motion" | "offline" | "storage";
export type Severity = "critical" | "warning" | "info";
export type RecordingMode = "continuous" | "motion";

export type Camera = {
  id: number;
  name: string;
  location: string;
  zone: string;
  protocol: "RTSP";
  streamUrl: string;
  status: CameraStatus;
  motion: boolean;
  scene: "day" | "night";
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
  cameras: Camera[];
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
  upsertCamera(input: CameraInput & { id?: number }): Promise<void>;
  setRetention(policy: RetentionPolicy): Promise<void>;
  acknowledgeEvent(id: number): Promise<void>;
  setCameraStatus(id: number, status: CameraStatus): Promise<void>;
};

export type CctvStore = CctvCommands & {
  getSnapshot(): SystemSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
};
