import { DbConnection, tables } from "../../client/src/lib/spacetimedb-bindings";
import type { UserRole } from "../../client/src/lib/cctv/types";

export type DesktopSyncState = {
  connected: boolean;
  analysisEvents: number;
  pendingReviews: number;
  auditRecords: number;
  queue: ReviewQueueItem[];
  installations: Array<{ id: number; name: string; location: string; timezone: string; status: string }>;
  cameras: Array<{ id: number; installationId: number; name: string }>;
  cameraHealth: Array<{ cameraId: number; consecutiveFailures: number; maintenanceNote: string; maintenanceStatus: string; maintenanceDueAt?: number }>;
  evidenceRecords: number;
  evidences: Array<{ id: number; evidenceRef: string; sha256: string; exportedAt?: number; signedExportRef?: string; signatureAlgorithm?: string }>;
  role: UserRole;
  actorName?: string;
  reason?: string;
};

export type ReviewQueueItem = { id: number; cameraId: number; task: string; classification: string; confidence: string; biometric: boolean };

function asNumber(value: unknown) { return typeof value === "bigint" ? Number(value) : Number(value); }
let activeConnection: any;
let activeIdentity = "";

function countRows(connection: any) {
  const analysis = Array.from(connection.db.analysisEvents.iter()) as any[];
  const actor = (Array.from(connection.db.actors.iter()) as any[]).find((entry) => String(entry.identity) === activeIdentity);
  const role: UserRole = ["admin", "operator", "auditor", "technician", "viewer"].includes(actor?.role) ? actor.role : "viewer";
  const installations = (Array.from(connection.db.installations.iter()) as any[]).map((installation) => ({ id: asNumber(installation.id), name: installation.name, location: installation.location, timezone: installation.timezone, status: installation.status }));
  const cameras = (Array.from(connection.db.cameras.iter()) as any[]).map((camera) => ({ id: asNumber(camera.id), installationId: asNumber(camera.installationId), name: camera.name }));
  const cameraHealth = (Array.from(connection.db.cameraHealth.iter()) as any[]).map((health) => ({ cameraId: asNumber(health.cameraId), consecutiveFailures: asNumber(health.consecutiveFailures), maintenanceNote: health.maintenanceNote, maintenanceStatus: health.maintenanceStatus, maintenanceDueAt: health.maintenanceDueAt ? asNumber(health.maintenanceDueAt) : undefined }));
  const evidences = (Array.from(connection.db.evidenceRecords.iter()) as any[]).map((evidence) => ({ id: asNumber(evidence.id), evidenceRef: evidence.evidenceRef, sha256: evidence.sha256, exportedAt: evidence.exportedAt ? asNumber(evidence.exportedAt) : undefined, signedExportRef: evidence.signedExportRef ?? undefined, signatureAlgorithm: evidence.signatureAlgorithm ?? undefined }));
  const queue = analysis.filter((event) => event.reviewRequired && !event.reviewed).map((event) => ({ id: asNumber(event.id), cameraId: asNumber(event.cameraId), task: event.task, classification: event.classification, confidence: event.confidence, biometric: event.biometric }));
  return {
    connected: true,
    analysisEvents: analysis.length,
    pendingReviews: queue.length,
    auditRecords: Array.from(connection.db.auditLogs.iter()).length,
    queue,
    installations,
    cameras,
    cameraHealth,
    evidenceRecords: evidences.length,
    evidences,
    role,
    actorName: actor?.displayName,
  } satisfies DesktopSyncState;
}

export function startDesktopSpacetimeBridge(onState: (state: DesktopSyncState) => void) {
  const uri = import.meta.env.VITE_SPACETIMEDB_URI || "ws://127.0.0.1:3001";
  const databaseName = import.meta.env.VITE_SPACETIMEDB_DATABASE || "spacevision-dvr-local";
  const tokenKey = `spacevision-desktop/${uri}/${databaseName}/auth_token`;
  const refresh = () => activeConnection && onState(countRows(activeConnection));
  activeConnection = DbConnection.builder()
    .withUri(uri)
    .withDatabaseName(databaseName)
    .withToken(localStorage.getItem(tokenKey) ?? undefined)
    .onConnect((active, identity, token) => {
      activeConnection = active;
      activeIdentity = String(identity);
      localStorage.setItem(tokenKey, token);
      active.subscriptionBuilder().onApplied(refresh).subscribe([tables.actors, tables.installations, tables.cameras, tables.cameraHealth, tables.analysisEvents, tables.evidenceRecords, tables.auditLogs, tables.biometricControls]);
      active.db.actors.onInsert(refresh);
      active.db.actors.onUpdate(refresh);
      active.db.installations.onInsert(refresh);
      active.db.installations.onUpdate(refresh);
      active.db.cameras.onInsert(refresh);
      active.db.cameras.onUpdate(refresh);
      active.db.cameras.onDelete(refresh);
      active.db.cameraHealth.onInsert(refresh);
      active.db.cameraHealth.onUpdate(refresh);
      active.db.analysisEvents.onInsert(refresh);
      active.db.analysisEvents.onUpdate(refresh);
      active.db.analysisEvents.onDelete(refresh);
      active.db.auditLogs.onInsert(refresh);
      active.db.evidenceRecords.onInsert(refresh);
      active.db.evidenceRecords.onUpdate(refresh);
      active.db.biometricControls.onInsert(refresh);
      active.db.biometricControls.onUpdate(refresh);
    })
    .onDisconnect(() => onState({ connected: false, analysisEvents: 0, pendingReviews: 0, auditRecords: 0, queue: [], installations: [], cameras: [], cameraHealth: [], evidenceRecords: 0, evidences: [], role: "viewer", reason: "sincronização interrompida" }))
    .onConnectError((error) => onState({ connected: false, analysisEvents: 0, pendingReviews: 0, auditRecords: 0, queue: [], installations: [], cameras: [], cameraHealth: [], evidenceRecords: 0, evidences: [], role: "viewer", reason: String(error) }))
    .build();
  return () => activeConnection?.disconnect();
}

export async function reviewAnalysisEvent(id: number, decision: string) {
  if (!activeConnection) throw new Error("SpacetimeDB não está conectado.");
  await activeConnection.reducers.reviewAnalysisEvent({ id, decision });
}

export async function submitAnalysisResult(cameraId: number, response: any, imagePath: string) {
  if (!activeConnection) throw new Error("SpacetimeDB não está conectado.");
  const evidenceRef = imagePath.split(/[\\/]/).pop() || "frame-local";
  for (const result of response.results ?? []) {
    if (result.status !== "ok") continue;
    for (const item of result.items ?? []) {
      const classification = String(item.label ?? item.text ?? item.hypothesis ?? item.kind ?? "resultado_local");
      const confidence = String(item.confidence ?? 0);
      await activeConnection.reducers.logAnalysisEvent({ cameraId, task: result.task, classification, confidence, evidenceRef, reviewRequired: true });
    }
  }
}

export async function upsertDesktopInstallation(input: { id?: number; name: string; location: string; timezone: string; status: string }) {
  if (!activeConnection) throw new Error("SpacetimeDB não está conectado.");
  await activeConnection.reducers.upsertInstallation({ id: input.id ?? 0, ...input });
}

export async function markEvidenceExported(id: number, signedExportRef: string, signatureAlgorithm: string) {
  if (!activeConnection) throw new Error("SpacetimeDB não está conectado.");
  await activeConnection.reducers.markEvidenceExported({ id, signedExportRef, signatureAlgorithm });
}

export async function reportCameraHealth(cameraId: number, success: boolean, maintenanceNote: string, maintenanceStatus = "none", maintenanceDueAt?: number) {
  if (!activeConnection) throw new Error("SpacetimeDB não está conectado.");
  await activeConnection.reducers.reportCameraHealth({ cameraId, success, maintenanceNote, maintenanceStatus, maintenanceDueAt });
}
