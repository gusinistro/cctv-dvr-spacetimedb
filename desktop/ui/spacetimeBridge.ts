import { DbConnection, tables } from "../../client/src/lib/spacetimedb-bindings";

export type DesktopSyncState = {
  connected: boolean;
  analysisEvents: number;
  pendingReviews: number;
  auditRecords: number;
  queue: ReviewQueueItem[];
  cameras: Array<{ id: number; name: string }>;
  reason?: string;
};

export type ReviewQueueItem = { id: number; cameraId: number; task: string; classification: string; confidence: string; biometric: boolean };

function asNumber(value: unknown) { return typeof value === "bigint" ? Number(value) : Number(value); }
let activeConnection: any;

function countRows(connection: any) {
  const analysis = Array.from(connection.db.analysisEvents.iter()) as any[];
  const cameras = (Array.from(connection.db.cameras.iter()) as any[]).map((camera) => ({ id: asNumber(camera.id), name: camera.name }));
  const queue = analysis.filter((event) => event.reviewRequired && !event.reviewed).map((event) => ({ id: asNumber(event.id), cameraId: asNumber(event.cameraId), task: event.task, classification: event.classification, confidence: event.confidence, biometric: event.biometric }));
  return {
    connected: true,
    analysisEvents: analysis.length,
    pendingReviews: queue.length,
    auditRecords: Array.from(connection.db.auditLogs.iter()).length,
    queue,
    cameras,
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
    .onConnect((active, _identity, token) => {
      activeConnection = active;
      localStorage.setItem(tokenKey, token);
      active.subscriptionBuilder().onApplied(refresh).subscribe([tables.cameras, tables.analysisEvents, tables.auditLogs, tables.biometricControls]);
      active.db.cameras.onInsert(refresh);
      active.db.cameras.onUpdate(refresh);
      active.db.cameras.onDelete(refresh);
      active.db.analysisEvents.onInsert(refresh);
      active.db.analysisEvents.onUpdate(refresh);
      active.db.analysisEvents.onDelete(refresh);
      active.db.auditLogs.onInsert(refresh);
      active.db.biometricControls.onInsert(refresh);
      active.db.biometricControls.onUpdate(refresh);
    })
    .onDisconnect(() => onState({ connected: false, analysisEvents: 0, pendingReviews: 0, auditRecords: 0, queue: [], cameras: [], reason: "sincronização interrompida" }))
    .onConnectError((error) => onState({ connected: false, analysisEvents: 0, pendingReviews: 0, auditRecords: 0, queue: [], cameras: [], reason: String(error) }))
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
