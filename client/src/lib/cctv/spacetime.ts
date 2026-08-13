import { createDemoStore } from "./demoStore";
import type { CameraInput, CameraStatus, CctvStore, RetentionPolicy, SystemSnapshot } from "./types";
import { DbConnection, tables } from "../spacetimedb-bindings";

function asNumber(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "__timestamp_micros_since_unix_epoch__" in value) {
    return Number((value as { __timestamp_micros_since_unix_epoch__: bigint }).__timestamp_micros_since_unix_epoch__) / 1000;
  }
  return Date.now();
}

function makeSpacetimeStore(uri: string, databaseName: string): CctvStore {
  const demo = createDemoStore();
  let actual: any;
  let snapshot: SystemSnapshot = { ...demo.getSnapshot(), connected: false, source: "spacetimedb" };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const refresh = () => {
    if (!actual) return;
    const rows = (name: string) => Array.from(actual.db[name].iter());
    const cameras = rows("cameras").map((row: any) => ({ ...row, id: asNumber(row.id), installationId: asNumber(row.installationId), status: row.status, protocol: "RTSP", motion: false, scene: "day" }));
    const installations = rows("installations").map((row: any) => ({ ...row, id: asNumber(row.id) }));
    const cameraHealth = rows("cameraHealth").map((row: any) => ({ ...row, cameraId: asNumber(row.cameraId), consecutiveFailures: asNumber(row.consecutiveFailures), lastCheckedAt: asNumber(row.lastCheckedAt), lastSuccessAt: asNumber(row.lastSuccessAt), maintenanceDueAt: row.maintenanceDueAt ? asNumber(row.maintenanceDueAt) : undefined }));
    const evidenceRecords = rows("evidenceRecords").map((row: any) => ({ ...row, id: asNumber(row.id), analysisEventId: asNumber(row.analysisEventId), cameraId: asNumber(row.cameraId), createdAt: asNumber(row.createdAt), exportedAt: row.exportedAt ? asNumber(row.exportedAt) : undefined }));
    const events = rows("events").map((row: any) => ({ ...row, id: asNumber(row.id), cameraId: row.cameraId ? asNumber(row.cameraId) : null, occurredAt: asNumber(row.occurredAt), acknowledged: row.acknowledged }));
    const recordings = rows("recordings").map((row: any) => ({ ...row, id: asNumber(row.id), cameraId: asNumber(row.cameraId), startedAt: asNumber(row.startedAt), durationSeconds: asNumber(row.durationSeconds) }));
    const retentionPolicies = rows("retentionPolicies").map((row: any) => ({ ...row, cameraId: asNumber(row.cameraId), retentionDays: asNumber(row.retentionDays) }));
    snapshot = { ...demo.getSnapshot(), installations, cameras, cameraHealth, evidenceRecords, events, recordings, retentionPolicies, connected: true, source: "spacetimedb", updatedAt: Date.now() };
    emit();
  };

  const tokenKey = `${uri}/${databaseName}/auth_token`;
  actual = DbConnection.builder()
    .withUri(uri)
    .withDatabaseName(databaseName)
    .withToken(localStorage.getItem(tokenKey) ?? undefined)
    .onConnect((connection, _identity, token) => {
      localStorage.setItem(tokenKey, token);
      actual = connection;
      connection.subscriptionBuilder().onApplied(refresh).subscribe([tables.installations, tables.cameras, tables.cameraHealth, tables.evidenceRecords, tables.recordings, tables.events, tables.retentionPolicies]);
      connection.db.installations.onInsert(refresh);
      connection.db.installations.onUpdate(refresh);
      connection.db.cameraHealth.onInsert(refresh);
      connection.db.cameraHealth.onUpdate(refresh);
      connection.db.evidenceRecords.onInsert(refresh);
      connection.db.evidenceRecords.onUpdate(refresh);
      connection.db.cameras.onInsert(refresh);
      connection.db.cameras.onUpdate(refresh);
      connection.db.cameras.onDelete(refresh);
      connection.db.recordings.onInsert(refresh);
      connection.db.recordings.onUpdate(refresh);
      connection.db.recordings.onDelete(refresh);
      connection.db.events.onInsert(refresh);
      connection.db.events.onUpdate(refresh);
      connection.db.events.onDelete(refresh);
      connection.db.retentionPolicies.onInsert(refresh);
      connection.db.retentionPolicies.onUpdate(refresh);
      connection.db.retentionPolicies.onDelete(refresh);
    })
    .onDisconnect(() => {
      snapshot = { ...snapshot, connected: false };
      emit();
    })
    .onConnectError(() => {
      snapshot = { ...demo.getSnapshot(), connected: false, source: "demo" };
      emit();
    })
    .build();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async upsertInstallation(input) {
      if (!actual) return demo.upsertInstallation(input);
      await actual.reducers.upsertInstallation({ id: input.id ?? 0, ...input });
    },
    async upsertCamera(input: CameraInput & { id?: number }) {
      if (!actual) return demo.upsertCamera(input);
      await actual.reducers.upsertCamera({ id: input.id ?? 0, ...input });
    },
    async reportCameraHealth(cameraId, success, maintenanceNote, maintenanceStatus, maintenanceDueAt) {
      if (!actual) return demo.reportCameraHealth(cameraId, success, maintenanceNote, maintenanceStatus, maintenanceDueAt);
      await actual.reducers.reportCameraHealth({ cameraId, success, maintenanceNote, maintenanceStatus, maintenanceDueAt });
    },
    async setRetention(policy: RetentionPolicy) {
      if (!actual) return demo.setRetention(policy);
      await actual.reducers.setRetentionPolicy(policy);
    },
    async acknowledgeEvent(id: number) {
      if (!actual) return demo.acknowledgeEvent(id);
      await actual.reducers.acknowledgeEvent({ id });
    },
    async setCameraStatus(id: number, status: CameraStatus) {
      const camera = snapshot.cameras.find((item) => item.id === id);
      if (!camera) return;
      return this.upsertCamera({ ...camera, id, status });
    },
    dispose() { actual?.disconnect(); demo.dispose(); listeners.clear(); },
  };
}

export function resolveSpacetimeConnection(config: { uri?: string; database?: string; development: boolean }) {
  return {
    uri: config.uri || (config.development ? "ws://127.0.0.1:3001" : undefined),
    database: config.database || (config.development ? "spacevision-dvr-local" : undefined),
  };
}

export function createCctvStoreFromConnection(connection: { uri?: string; database?: string }) {
  return connection.uri && connection.database ? makeSpacetimeStore(connection.uri, connection.database) : createDemoStore();
}

export function createCctvStore() {
  const resolved = resolveSpacetimeConnection({
    uri: import.meta.env.VITE_SPACETIMEDB_URI as string | undefined,
    database: import.meta.env.VITE_SPACETIMEDB_DATABASE as string | undefined,
    development: import.meta.env.DEV,
  });
  return createCctvStoreFromConnection(resolved);
}
