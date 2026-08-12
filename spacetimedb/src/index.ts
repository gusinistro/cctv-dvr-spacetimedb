import { schema, SenderError, table, t } from "spacetimedb/server";

const actors = table(
  { name: "actors", public: true },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string(),
    role: t.string().index("btree"),
    createdAt: t.timestamp(),
  },
);

const installations = table(
  { name: "installations", public: true },
  {
    id: t.u32().primaryKey().autoInc(),
    name: t.string(),
    location: t.string(),
    timezone: t.string(),
    managerId: t.identity().index("btree"),
    status: t.string().index("btree"),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  },
);

const cameras = table(
  { name: "cameras", public: true },
  {
    id: t.u32().primaryKey().autoInc(),
    installationId: t.u32().index("btree"),
    name: t.string(),
    location: t.string(),
    zone: t.string().index("btree"),
    tags: t.string(),
    protocol: t.string(),
    streamUrl: t.string(),
    status: t.string().index("btree"),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  },
);

const recordings = table(
  { name: "recordings", public: true },
  {
    id: t.u32().primaryKey().autoInc(),
    cameraId: t.u32().index("btree"),
    startedAt: t.timestamp().index("btree"),
    endedAt: t.timestamp(),
    durationSeconds: t.u32(),
    hasMotion: t.bool(),
    quality: t.string(),
  },
);

const events = table(
  { name: "events", public: true },
  {
    id: t.u32().primaryKey().autoInc(),
    cameraId: t.u32().index("btree"),
    type: t.string().index("btree"),
    severity: t.string().index("btree"),
    message: t.string(),
    occurredAt: t.timestamp().index("btree"),
    acknowledged: t.bool(),
  },
);

const retentionPolicies = table(
  { name: "retention_policies", public: true },
  {
    id: t.u32().primaryKey().autoInc(),
    cameraId: t.u32().unique(),
    retentionDays: t.u32(),
    quality: t.string(),
    recordingMode: t.string(),
    updatedAt: t.timestamp(),
  },
);

const analysisEvents = table(
  { name: "analysis_events", public: true },
  {
    id: t.u32().primaryKey().autoInc(),
    cameraId: t.u32().index("btree"),
    task: t.string().index("btree"),
    classification: t.string(),
    confidence: t.string(),
    evidenceRef: t.string(),
    reviewRequired: t.bool(),
    reviewed: t.bool().index("btree"),
    biometric: t.bool().index("btree"),
    createdAt: t.timestamp().index("btree"),
  },
);

const biometricControls = table(
  { name: "biometric_controls", public: true },
  {
    id: t.u32().primaryKey(),
    faceRecognitionEnabled: t.bool(),
    emotionalSignalEnabled: t.bool(),
    consentRecorded: t.bool(),
    humanReviewRequired: t.bool(),
    retentionDays: t.u32(),
    updatedAt: t.timestamp(),
  },
);

const cameraHealth = table(
  { name: "camera_health", public: true },
  {
    cameraId: t.u32().primaryKey(),
    consecutiveFailures: t.u32(),
    lastCheckedAt: t.timestamp().index("btree"),
    lastSuccessAt: t.timestamp(),
    maintenanceNote: t.string(),
    maintenanceStatus: t.string().index("btree"),
    maintenanceDueAt: t.option(t.timestamp()),
  },
);

const evidenceRecords = table(
  { name: "evidence_records", public: true },
  {
    id: t.u32().primaryKey().autoInc(),
    analysisEventId: t.u32().index("btree"),
    cameraId: t.u32().index("btree"),
    evidenceRef: t.string(),
    sha256: t.string().index("btree"),
    recordedBy: t.identity().index("btree"),
    createdAt: t.timestamp().index("btree"),
    exportedAt: t.option(t.timestamp()),
    exportedBy: t.option(t.identity()),
    signedExportRef: t.option(t.string()),
    signatureAlgorithm: t.option(t.string()),
  },
);

const auditLogs = table(
  { name: "audit_logs", public: true },
  {
    id: t.u32().primaryKey().autoInc(),
    actor: t.identity().index("btree"),
    action: t.string().index("btree"),
    subject: t.string(),
    details: t.string(),
    createdAt: t.timestamp().index("btree"),
  },
);

const spacetimedb = schema({ actors, installations, cameras, recordings, events, retentionPolicies, analysisEvents, biometricControls, cameraHealth, evidenceRecords, auditLogs });
export default spacetimedb;

const allowedRoles = ["admin", "operator", "auditor", "viewer", "technician"];

function requireAnyRole(ctx: any, roles: string[]) {
  const actor = ctx.db.actors.identity.find(ctx.sender);
  if (!actor || !roles.includes(actor.role)) {
    throw new SenderError(`Ação restrita aos papéis: ${roles.join(", ")}.`);
  }
  return actor;
}

function requireAdmin(ctx: any) {
  return requireAnyRole(ctx, ["admin"]);
}

function requireOperator(ctx: any) {
  return requireAnyRole(ctx, ["admin", "operator"]);
}

function requireTechnician(ctx: any) {
  return requireAnyRole(ctx, ["admin", "operator", "technician"]);
}

function audit(ctx: any, action: string, subject: string, details: string) {
  ctx.db.auditLogs.insert({ id: 0, actor: ctx.sender, action, subject, details, createdAt: ctx.timestamp });
}

function activeBiometricControls(ctx: any) {
  return ctx.db.biometricControls.id.find(1) ?? {
    id: 1,
    faceRecognitionEnabled: false,
    emotionalSignalEnabled: false,
    consentRecorded: false,
    humanReviewRequired: true,
    retentionDays: 7,
    updatedAt: ctx.timestamp,
  };
}

function seedDemoData(ctx: any) {
  if (!ctx.db.cameras.iter().next().done) return;
  const installation = ctx.db.installations.insert({ id: 0, name: "Instalação central", location: "São Paulo · BR", timezone: "America/Sao_Paulo", managerId: ctx.sender, status: "active", createdAt: ctx.timestamp, updatedAt: ctx.timestamp });
  const seedCameras = [
    { name: "Entrada principal", location: "Portaria norte", zone: "Acesso", tags: "acesso,perímetro", streamUrl: "rtsp://simulado/entrada", status: "online" },
    { name: "Recepção", location: "Bloco administrativo", zone: "Lobby", tags: "público,atendimento", streamUrl: "rtsp://simulado/recepcao", status: "online" },
    { name: "Pátio logístico", location: "Docas 01–04", zone: "Operação", tags: "logística,docas", streamUrl: "rtsp://simulado/patio", status: "online" },
    { name: "Corredor leste", location: "Nível 2", zone: "Interno", tags: "interno,rota", streamUrl: "rtsp://simulado/corredor", status: "online" },
    { name: "Estacionamento", location: "Setor visitante", zone: "Externo", tags: "veículos,perímetro", streamUrl: "rtsp://simulado/estacionamento", status: "online" },
    { name: "Sala de servidores", location: "Subsolo", zone: "Crítico", tags: "crítico,infraestrutura", streamUrl: "rtsp://simulado/servidores", status: "online" },
    { name: "Saída de emergência", location: "Ala oeste", zone: "Acesso", tags: "emergência,rota", streamUrl: "rtsp://simulado/saida", status: "offline" },
    { name: "Perímetro sul", location: "Cerca externa", zone: "Externo", tags: "perímetro,externo", streamUrl: "rtsp://simulado/perimetro", status: "online" },
  ];
  const cameras = seedCameras.map((camera) => ctx.db.cameras.insert({ id: 0, installationId: installation.id, ...camera, protocol: "RTSP", createdAt: ctx.timestamp, updatedAt: ctx.timestamp }));
  for (const camera of cameras) {
    ctx.db.retentionPolicies.insert({ id: 0, cameraId: camera.id, retentionDays: camera.zone === "Crítico" ? 60 : 30, quality: camera.zone === "Crítico" ? "4K" : "1080p", recordingMode: camera.zone === "Acesso" ? "motion" : "continuous", updatedAt: ctx.timestamp });
    ctx.db.cameraHealth.insert({ cameraId: camera.id, consecutiveFailures: camera.status === "offline" ? 1 : 0, lastCheckedAt: ctx.timestamp, lastSuccessAt: ctx.timestamp, maintenanceNote: camera.status === "offline" ? "Inspeção preventiva solicitada" : "", maintenanceStatus: camera.status === "offline" ? "scheduled" : "none", maintenanceDueAt: undefined });
    ctx.db.recordings.insert({ id: 0, cameraId: camera.id, startedAt: ctx.timestamp, endedAt: ctx.timestamp, durationSeconds: 720, hasMotion: camera.zone === "Acesso" || camera.zone === "Externo", quality: camera.zone === "Crítico" ? "4K" : "1080p" });
  }
  ctx.db.events.insert({ id: 0, cameraId: cameras[1].id, type: "motion", severity: "warning", message: "Movimento identificado na recepção", occurredAt: ctx.timestamp, acknowledged: false });
  ctx.db.events.insert({ id: 0, cameraId: cameras[6].id, type: "offline", severity: "critical", message: "Câmera sem resposta no perímetro de emergência", occurredAt: ctx.timestamp, acknowledged: false });
  ctx.db.events.insert({ id: 0, cameraId: cameras[5].id, type: "storage", severity: "warning", message: "Armazenamento local acima de 75%", occurredAt: ctx.timestamp, acknowledged: false });
}

export const init = spacetimedb.init((ctx) => {
  seedDemoData(ctx);
});

export const bootstrap_admin = spacetimedb.reducer(
  { displayName: t.string() },
  (ctx, { displayName }) => {
    if (!ctx.db.actors.iter().next().done) {
      throw new SenderError("O administrador inicial já foi definido.");
    }
    ctx.db.actors.insert({
      identity: ctx.sender,
      displayName,
      role: "admin",
      createdAt: ctx.timestamp,
    });
  },
);

export const register_viewer = spacetimedb.reducer(
  { displayName: t.string() },
  (ctx, { displayName }) => {
    if (ctx.db.actors.identity.find(ctx.sender)) return;
    ctx.db.actors.insert({
      identity: ctx.sender,
      displayName,
      role: "viewer",
      createdAt: ctx.timestamp,
    });
  },
);

export const seed_demo = spacetimedb.reducer((ctx) => {
  requireAdmin(ctx);
  seedDemoData(ctx);
});

export const set_actor_role = spacetimedb.reducer(
  { identity: t.identity(), role: t.string() },
  (ctx, { identity, role }) => {
    requireAdmin(ctx);
    if (!allowedRoles.includes(role)) throw new SenderError("Papel inválido.");
    const actor = ctx.db.actors.identity.find(identity);
    if (!actor) throw new SenderError("Ator não encontrado.");
    ctx.db.actors.identity.update({ ...actor, role });
    audit(ctx, "actor_role_updated", `actor:${identity}`, JSON.stringify({ role }));
  },
);

export const upsert_installation = spacetimedb.reducer(
  { id: t.u32(), name: t.string(), location: t.string(), timezone: t.string(), status: t.string() },
  (ctx, input) => {
    requireAdmin(ctx);
    if (input.status !== "active" && input.status !== "maintenance" && input.status !== "inactive") throw new SenderError("Status de instalação inválido.");
    if (input.id === 0) {
      const created = ctx.db.installations.insert({ ...input, managerId: ctx.sender, createdAt: ctx.timestamp, updatedAt: ctx.timestamp });
      audit(ctx, "installation_created", `installation:${created.id}`, JSON.stringify({ name: input.name, status: input.status }));
      return;
    }
    const installation = ctx.db.installations.id.find(input.id);
    if (!installation) throw new SenderError("Instalação não encontrada.");
    ctx.db.installations.id.update({ ...installation, ...input, updatedAt: ctx.timestamp });
    audit(ctx, "installation_updated", `installation:${installation.id}`, JSON.stringify({ name: input.name, status: input.status }));
  },
);

export const upsert_camera = spacetimedb.reducer(
  {
    id: t.u32(),
    installationId: t.u32(),
    name: t.string(),
    location: t.string(),
    zone: t.string(),
    tags: t.string(),
    protocol: t.string(),
    streamUrl: t.string(),
    status: t.string(),
  },
  (ctx, input) => {
    requireAdmin(ctx);
    if (input.status !== "online" && input.status !== "offline") {
      throw new SenderError("Status de câmera inválido.");
    }
    if (!ctx.db.installations.id.find(input.installationId)) throw new SenderError("Instalação não encontrada.");
    if (input.id === 0) {
      const created = ctx.db.cameras.insert({ ...input, createdAt: ctx.timestamp, updatedAt: ctx.timestamp });
      ctx.db.cameraHealth.insert({ cameraId: created.id, consecutiveFailures: created.status === "offline" ? 1 : 0, lastCheckedAt: ctx.timestamp, lastSuccessAt: ctx.timestamp, maintenanceNote: "", maintenanceStatus: created.status === "offline" ? "scheduled" : "none", maintenanceDueAt: undefined });
      audit(ctx, "camera_created", `camera:${created.id}`, JSON.stringify({ name: input.name, zone: input.zone, protocol: input.protocol }));
      return;
    }
    const camera = ctx.db.cameras.id.find(input.id);
    if (!camera) throw new SenderError("Câmera não encontrada.");
    ctx.db.cameras.id.update({ ...camera, ...input, updatedAt: ctx.timestamp });
    audit(ctx, "camera_updated", `camera:${camera.id}`, JSON.stringify({ name: input.name, zone: input.zone, status: input.status }));
  },
);

export const set_retention_policy = spacetimedb.reducer(
  { cameraId: t.u32(), retentionDays: t.u32(), quality: t.string(), recordingMode: t.string() },
  (ctx, input) => {
    requireAdmin(ctx);
    if (!ctx.db.cameras.id.find(input.cameraId)) throw new SenderError("Câmera não encontrada.");
    const existing = ctx.db.retentionPolicies.cameraId.find(input.cameraId);
    if (existing) {
      ctx.db.retentionPolicies.id.update({ ...existing, ...input, updatedAt: ctx.timestamp });
      audit(ctx, "retention_policy_updated", `camera:${input.cameraId}`, JSON.stringify({ retentionDays: input.retentionDays, quality: input.quality, recordingMode: input.recordingMode }));
      return;
    }
    ctx.db.retentionPolicies.insert({ id: 0, ...input, updatedAt: ctx.timestamp });
    audit(ctx, "retention_policy_created", `camera:${input.cameraId}`, JSON.stringify({ retentionDays: input.retentionDays, quality: input.quality, recordingMode: input.recordingMode }));
  },
);

export const acknowledge_event = spacetimedb.reducer(
  { id: t.u32() },
  (ctx, { id }) => {
    requireOperator(ctx);
    const event = ctx.db.events.id.find(id);
    if (!event) throw new SenderError("Evento não encontrado.");
    ctx.db.events.id.update({ ...event, acknowledged: true });
    audit(ctx, "event_acknowledged", `event:${id}`, JSON.stringify({ cameraId: event.cameraId, type: event.type }));
  },
);

export const log_system_event = spacetimedb.reducer(
  { cameraId: t.u32(), type: t.string(), severity: t.string(), message: t.string() },
  (ctx, input) => {
    requireOperator(ctx);
    const created = ctx.db.events.insert({ id: 0, ...input, occurredAt: ctx.timestamp, acknowledged: false });
    audit(ctx, "system_event_logged", `event:${created.id}`, JSON.stringify({ cameraId: input.cameraId, type: input.type, severity: input.severity }));
  },
);

export const report_camera_health = spacetimedb.reducer(
  { cameraId: t.u32(), success: t.bool(), maintenanceNote: t.string(), maintenanceStatus: t.string(), maintenanceDueAt: t.option(t.timestamp()) },
  (ctx, input) => {
    requireTechnician(ctx);
    const camera = ctx.db.cameras.id.find(input.cameraId);
    if (!camera) throw new SenderError("Câmera não encontrada.");
    if (!["none", "scheduled", "in_progress", "completed"].includes(input.maintenanceStatus)) throw new SenderError("Status de manutenção inválido.");
    const existing = ctx.db.cameraHealth.cameraId.find(input.cameraId) ?? { cameraId: input.cameraId, consecutiveFailures: 0, lastCheckedAt: ctx.timestamp, lastSuccessAt: ctx.timestamp, maintenanceNote: "", maintenanceStatus: "none", maintenanceDueAt: undefined };
    const consecutiveFailures = input.success ? 0 : existing.consecutiveFailures + 1;
    const maintenanceStatus = input.success && input.maintenanceStatus === "scheduled" ? "completed" : input.maintenanceStatus === "none" && !input.success ? "scheduled" : input.maintenanceStatus;
    ctx.db.cameraHealth.cameraId.update({ ...existing, consecutiveFailures, lastCheckedAt: ctx.timestamp, lastSuccessAt: input.success ? ctx.timestamp : existing.lastSuccessAt, maintenanceNote: input.maintenanceNote, maintenanceStatus, maintenanceDueAt: input.maintenanceDueAt });
    const status = input.success ? "online" : consecutiveFailures >= 3 ? "offline" : camera.status;
    if (status !== camera.status) ctx.db.cameras.id.update({ ...camera, status, updatedAt: ctx.timestamp });
    audit(ctx, "camera_health_reported", `camera:${input.cameraId}`, JSON.stringify({ success: input.success, consecutiveFailures, maintenanceStatus, maintenanceDueAt: input.maintenanceDueAt ? "scheduled" : null }));
  },
);

export const set_biometric_controls = spacetimedb.reducer(
  { faceRecognitionEnabled: t.bool(), emotionalSignalEnabled: t.bool(), consentRecorded: t.bool(), humanReviewRequired: t.bool(), retentionDays: t.u32() },
  (ctx, input) => {
    requireAdmin(ctx);
    if (input.retentionDays === 0 || input.retentionDays > 30) throw new SenderError("A retenção biométrica deve ficar entre 1 e 30 dias.");
    if ((input.faceRecognitionEnabled || input.emotionalSignalEnabled) && !input.consentRecorded) throw new SenderError("Recursos biométricos exigem consentimento ou fundamento autorizado registrado.");
    if (!input.humanReviewRequired) throw new SenderError("Revisão humana é obrigatória para recursos biométricos.");
    const existing = ctx.db.biometricControls.id.find(1);
    const value = { id: 1, ...input, updatedAt: ctx.timestamp };
    if (existing) ctx.db.biometricControls.id.update(value);
    else ctx.db.biometricControls.insert(value);
    audit(ctx, "biometric_controls_updated", "biometric_controls:1", JSON.stringify({ face: input.faceRecognitionEnabled, emotion: input.emotionalSignalEnabled, retentionDays: input.retentionDays }));
  },
);

export const log_analysis_event = spacetimedb.reducer(
  { cameraId: t.u32(), task: t.string(), classification: t.string(), confidence: t.string(), evidenceRef: t.string(), reviewRequired: t.bool() },
  (ctx, input) => {
    requireAdmin(ctx);
    if (!ctx.db.cameras.id.find(input.cameraId)) throw new SenderError("Câmera não encontrada.");
    const biometric = input.task === "faces" || input.task === "emotion";
    const controls = activeBiometricControls(ctx);
    if (biometric && (!controls.consentRecorded || !controls.humanReviewRequired || (input.task === "faces" && !controls.faceRecognitionEnabled) || (input.task === "emotion" && !controls.emotionalSignalEnabled))) {
      throw new SenderError("Evento biométrico bloqueado pela política ativa.");
    }
    const created = ctx.db.analysisEvents.insert({ id: 0, ...input, reviewRequired: biometric ? true : input.reviewRequired, reviewed: false, biometric, createdAt: ctx.timestamp });
    audit(ctx, "analysis_event_logged", `analysis_event:${created.id}`, JSON.stringify({ task: input.task, cameraId: input.cameraId, biometric }));
  },
);

export const review_analysis_event = spacetimedb.reducer(
  { id: t.u32(), decision: t.string() },
  (ctx, { id, decision }) => {
    requireOperator(ctx);
    const event = ctx.db.analysisEvents.id.find(id);
    if (!event) throw new SenderError("Evento de análise não encontrado.");
    ctx.db.analysisEvents.id.update({ ...event, reviewed: true });
    audit(ctx, "analysis_event_reviewed", `analysis_event:${id}`, JSON.stringify({ decision }));
  },
);

export const hash_evidence = spacetimedb.reducer(
  { analysisEventId: t.u32(), sha256: t.string(), evidenceRef: t.string() },
  (ctx, input) => {
    requireOperator(ctx);
    const analysis = ctx.db.analysisEvents.id.find(input.analysisEventId);
    if (!analysis) throw new SenderError("Evento de análise não encontrado.");
    const normalizedHash = input.sha256.toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalizedHash)) throw new SenderError("Hash SHA-256 inválido.");
    if (Array.from(ctx.db.evidenceRecords.iter()).some((record: any) => record.sha256 === normalizedHash && record.analysisEventId !== input.analysisEventId)) throw new SenderError("Hash de evidência já associado a outro evento.");
    const created = ctx.db.evidenceRecords.insert({ id: 0, analysisEventId: analysis.id, cameraId: analysis.cameraId, evidenceRef: input.evidenceRef, sha256: normalizedHash, recordedBy: ctx.sender, createdAt: ctx.timestamp, exportedAt: undefined, exportedBy: undefined, signedExportRef: undefined, signatureAlgorithm: undefined });
    audit(ctx, "evidence_hashed", `evidence:${created.id}`, JSON.stringify({ analysisEventId: analysis.id, sha256: normalizedHash, evidenceRef: input.evidenceRef }));
  },
);

export const mark_evidence_exported = spacetimedb.reducer(
  { id: t.u32(), signedExportRef: t.string(), signatureAlgorithm: t.string() },
  (ctx, input) => {
    requireAnyRole(ctx, ["admin", "auditor"]);
    const evidence = ctx.db.evidenceRecords.id.find(input.id);
    if (!evidence) throw new SenderError("Evidência não encontrada.");
    if (!input.signedExportRef || !input.signatureAlgorithm) throw new SenderError("Exportação exige referência assinada e algoritmo de assinatura.");
    ctx.db.evidenceRecords.id.update({ ...evidence, exportedAt: ctx.timestamp, exportedBy: ctx.sender, signedExportRef: input.signedExportRef, signatureAlgorithm: input.signatureAlgorithm });
    audit(ctx, "evidence_exported", `evidence:${evidence.id}`, JSON.stringify({ signedExportRef: input.signedExportRef, signatureAlgorithm: input.signatureAlgorithm }));
  },
);

export const enforce_data_retention = spacetimedb.reducer((ctx) => {
  requireAdmin(ctx);
  let removedAnalysis = 0;
  let removedEvidence = 0;
  const controls = activeBiometricControls(ctx);
  for (const event of ctx.db.analysisEvents.iter()) {
    const policy = ctx.db.retentionPolicies.cameraId.find(event.cameraId);
    const allowedDays = event.biometric ? Math.min(policy?.retentionDays ?? 30, controls.retentionDays) : policy?.retentionDays ?? 30;
    const cutoffMicros = ctx.timestamp.microsSinceUnixEpoch - BigInt(allowedDays) * 24n * 60n * 60n * 1000000n;
    if (event.createdAt.microsSinceUnixEpoch < cutoffMicros) {
      ctx.db.analysisEvents.id.delete(event.id);
      removedAnalysis += 1;
    }
  }
  for (const evidence of ctx.db.evidenceRecords.iter()) {
    const policy = ctx.db.retentionPolicies.cameraId.find(evidence.cameraId);
    const cutoffMicros = ctx.timestamp.microsSinceUnixEpoch - BigInt(policy?.retentionDays ?? 30) * 24n * 60n * 60n * 1000000n;
    if (evidence.createdAt.microsSinceUnixEpoch < cutoffMicros) {
      ctx.db.evidenceRecords.id.delete(evidence.id);
      removedEvidence += 1;
    }
  }
  audit(ctx, "retention_enforced", "data_retention", JSON.stringify({ removedAnalysis, removedEvidence }));
});
