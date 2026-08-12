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

const cameras = table(
  { name: "cameras", public: true },
  {
    id: t.u32().primaryKey().autoInc(),
    name: t.string(),
    location: t.string(),
    zone: t.string().index("btree"),
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

const spacetimedb = schema({ actors, cameras, recordings, events, retentionPolicies });
export default spacetimedb;

function requireAdmin(ctx: any) {
  const actor = ctx.db.actors.identity.find(ctx.sender);
  if (!actor || actor.role !== "admin") {
    throw new SenderError("Ação restrita ao papel admin.");
  }
}

function seedDemoData(ctx: any) {
  if (!ctx.db.cameras.iter().next().done) return;
  const seedCameras = [
    { name: "Entrada principal", location: "Portaria norte", zone: "Acesso", streamUrl: "rtsp://simulado/entrada", status: "online" },
    { name: "Recepção", location: "Bloco administrativo", zone: "Lobby", streamUrl: "rtsp://simulado/recepcao", status: "online" },
    { name: "Pátio logístico", location: "Docas 01–04", zone: "Operação", streamUrl: "rtsp://simulado/patio", status: "online" },
    { name: "Corredor leste", location: "Nível 2", zone: "Interno", streamUrl: "rtsp://simulado/corredor", status: "online" },
    { name: "Estacionamento", location: "Setor visitante", zone: "Externo", streamUrl: "rtsp://simulado/estacionamento", status: "online" },
    { name: "Sala de servidores", location: "Subsolo", zone: "Crítico", streamUrl: "rtsp://simulado/servidores", status: "online" },
    { name: "Saída de emergência", location: "Ala oeste", zone: "Acesso", streamUrl: "rtsp://simulado/saida", status: "offline" },
    { name: "Perímetro sul", location: "Cerca externa", zone: "Externo", streamUrl: "rtsp://simulado/perimetro", status: "online" },
  ];
  const cameras = seedCameras.map((camera) => ctx.db.cameras.insert({ id: 0, ...camera, protocol: "RTSP", createdAt: ctx.timestamp, updatedAt: ctx.timestamp }));
  for (const camera of cameras) {
    ctx.db.retentionPolicies.insert({ id: 0, cameraId: camera.id, retentionDays: camera.zone === "Crítico" ? 60 : 30, quality: camera.zone === "Crítico" ? "4K" : "1080p", recordingMode: camera.zone === "Acesso" ? "motion" : "continuous", updatedAt: ctx.timestamp });
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
    if (role !== "admin" && role !== "viewer") throw new SenderError("Papel inválido.");
    const actor = ctx.db.actors.identity.find(identity);
    if (!actor) throw new SenderError("Ator não encontrado.");
    ctx.db.actors.identity.update({ ...actor, role });
  },
);

export const upsert_camera = spacetimedb.reducer(
  {
    id: t.u32(),
    name: t.string(),
    location: t.string(),
    zone: t.string(),
    protocol: t.string(),
    streamUrl: t.string(),
    status: t.string(),
  },
  (ctx, input) => {
    requireAdmin(ctx);
    if (input.status !== "online" && input.status !== "offline") {
      throw new SenderError("Status de câmera inválido.");
    }
    if (input.id === 0) {
      ctx.db.cameras.insert({ ...input, createdAt: ctx.timestamp, updatedAt: ctx.timestamp });
      return;
    }
    const camera = ctx.db.cameras.id.find(input.id);
    if (!camera) throw new SenderError("Câmera não encontrada.");
    ctx.db.cameras.id.update({ ...camera, ...input, updatedAt: ctx.timestamp });
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
      return;
    }
    ctx.db.retentionPolicies.insert({ id: 0, ...input, updatedAt: ctx.timestamp });
  },
);

export const acknowledge_event = spacetimedb.reducer(
  { id: t.u32() },
  (ctx, { id }) => {
    requireAdmin(ctx);
    const event = ctx.db.events.id.find(id);
    if (!event) throw new SenderError("Evento não encontrado.");
    ctx.db.events.id.update({ ...event, acknowledged: true });
  },
);

export const log_system_event = spacetimedb.reducer(
  { cameraId: t.u32(), type: t.string(), severity: t.string(), message: t.string() },
  (ctx, input) => {
    requireAdmin(ctx);
    ctx.db.events.insert({ id: 0, ...input, occurredAt: ctx.timestamp, acknowledged: false });
  },
);
