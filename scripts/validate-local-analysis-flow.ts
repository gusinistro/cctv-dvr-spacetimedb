import { DbConnection, tables } from "../client/src/lib/spacetimedb-bindings";
import { resolveDesktopRole } from "../desktop/ui/spacetimeBridge";
import { can } from "../client/src/lib/cctv/access";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";

const uri = process.env.SPACETIMEDB_URI ?? "ws://127.0.0.1:3001";
const databaseName = process.env.SPACETIMEDB_DATABASE ?? "spacevision-analysis-test";

function connect() {
  return new Promise<any>((resolve, reject) => {
    DbConnection.builder().withUri(uri).withDatabaseName(databaseName).onConnect((connection, identity) => resolve({ connection, identity })).onConnectError((error) => reject(new Error(`Falha de conexão: ${String(error)}`))).build();
  });
}

function applySubscription(connection: any) {
  return new Promise<void>((resolve) => {
    connection.subscriptionBuilder().onApplied(() => resolve()).subscribe([tables.actors, tables.installations, tables.cameras, tables.cameraHealth, tables.events, tables.analysisEvents, tables.evidenceRecords, tables.auditLogs, tables.biometricControls]);
  });
}

function runWorkerFixture() {
  const directory = mkdtempSync(join(tmpdir(), "spacevision-analysis-"));
  const modelDir = join(directory, "model-packs");
  mkdirSync(modelDir);
  const generated = spawnSync("python3", ["desktop/vision-worker/generate_test_models.py", modelDir], { encoding: "utf8" });
  if (generated.status !== 0) throw new Error(`Não foi possível gerar fixture ONNX: ${generated.stderr}`);
  const imagePath = join(directory, "frame.ppm");
  writeFileSync(imagePath, Buffer.concat([Buffer.from("P6\n640 640\n255\n"), Buffer.alloc(640 * 640 * 3)]));
  const command = { action: "analyze", imagePath, tasks: ["objects"], policy: { humanReviewRequired: true } };
  const worker = spawnSync("python3", ["desktop/vision-worker/worker.py"], { input: `${JSON.stringify(command)}\n`, encoding: "utf8", env: { ...process.env, SPACEVISION_MODEL_DIR: directory } });
  if (worker.status !== 0) throw new Error(`Worker local falhou: ${worker.stderr}`);
  const response = JSON.parse(worker.stdout.trim());
  const item = response.results?.[0]?.items?.[0];
  if (!item?.label || !item?.confidence) throw new Error("Worker não retornou uma detecção ONNX para validação.");
  return { imagePath, item, task: response.results[0].task as string };
}

function signEvidenceFixture(path: string) {
  const evidenceRef = path.split(/[\\/]/).pop() || "frame-local";
  const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
  const payload = Buffer.from(`spacevision-evidence-v1\n${evidenceRef}\n${sha256}`);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signature = sign(null, payload, privateKey);
  if (!verify(null, payload, publicKey, signature)) throw new Error("A assinatura Ed25519 da fixture de evidência não foi validada.");
  const manifest = { evidenceRef, sha256, algorithm: "Ed25519", signature: signature.toString("base64"), publicKey: publicKey.export({ type: "spki", format: "pem" }) };
  const manifestPath = `${path}.spacevision-signature.json`;
  writeFileSync(manifestPath, JSON.stringify(manifest));
  return { evidenceRef, sha256, manifestPath, algorithm: manifest.algorithm };
}

async function main() {
  const adminSession = await connect();
  const connection = adminSession.connection;
  let operatorSession: any;
  let auditorSession: any;
  let technicianSession: any;
  let viewerSession: any;
  try {
    await connection.reducers.bootstrapAdmin({ displayName: "Validação Desktop" });
    await applySubscription(connection);
    await connection.reducers.upsertInstallation({ id: 0, name: "Unidade de validação", location: "Campinas · BR", timezone: "America/Sao_Paulo", status: "active" });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const validationInstallation = Array.from(connection.db.installations.iter()).find((entry: any) => entry.name === "Unidade de validação") as any;
    if (!validationInstallation) throw new Error("A instalação adicional não foi criada pelo reducer reativo.");
    await connection.reducers.upsertCamera({ id: 0, installationId: Number(validationInstallation.id), name: "Câmera de validação", location: "Laboratório", zone: "QA", tags: "validação,automação", protocol: "RTSP", streamUrl: "rtsp://simulado/validacao", status: "online" });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const taggedCamera = Array.from(connection.db.cameras.iter()).find((entry: any) => entry.name === "Câmera de validação") as any;
    if (!taggedCamera || taggedCamera.tags !== "validação,automação" || Number(taggedCamera.installationId) !== Number(validationInstallation.id)) throw new Error("A câmera etiquetada não foi vinculada corretamente à instalação.");
    const camera = Array.from(connection.db.cameras.iter())[0] as any;
    if (!camera) throw new Error("Nenhuma câmera semeada para validação.");
    const workerResult = runWorkerFixture();
    const signedFixture = signEvidenceFixture(workerResult.imagePath);
    await connection.reducers.setBiometricControls({ faceRecognitionEnabled: false, emotionalSignalEnabled: false, consentRecorded: false, humanReviewRequired: true, retentionDays: 7 });
    await connection.reducers.logAnalysisEvent({ cameraId: Number(camera.id), task: workerResult.task, classification: workerResult.item.label, confidence: String(workerResult.item.confidence), evidenceRef: workerResult.imagePath.split(/[\\/]/).pop(), reviewRequired: true });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const event = Array.from(connection.db.analysisEvents.iter())[0] as any;
    if (!event || event.reviewed || Number(event.cameraId) !== Number(camera.id)) throw new Error("O evento do worker não entrou corretamente na fila de revisão.");
    await connection.reducers.reviewAnalysisEvent({ id: Number(event.id), decision: "approved" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const reviewed = Array.from(connection.db.analysisEvents.iter())[0] as any;
    const auditCount = Array.from(connection.db.auditLogs.iter()).length;
    if (!reviewed?.reviewed || auditCount < 3) throw new Error("A revisão ou a auditoria não foi persistida.");
    await connection.reducers.hashEvidence({ analysisEventId: Number(reviewed.id), sha256: signedFixture.sha256, evidenceRef: signedFixture.evidenceRef });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const evidence = Array.from(connection.db.evidenceRecords.iter())[0] as any;
    if (!evidence || evidence.sha256 !== signedFixture.sha256) throw new Error("O hash de integridade da evidência assinada não foi registrado.");

    operatorSession = await connect();
    await operatorSession.connection.reducers.registerViewer({ displayName: "Operador de validação" });
    await new Promise((resolve) => setTimeout(resolve, 80));
    await connection.reducers.setActorRole({ identity: operatorSession.identity, role: "operator" });
    await applySubscription(operatorSession.connection);
    const operatorDesktopRole = resolveDesktopRole(operatorSession.connection.db.actors.iter(), String(operatorSession.identity));
    if (operatorDesktopRole !== "operator" || !can(operatorDesktopRole, "review_analysis") || can(operatorDesktopRole, "manage_biometrics")) throw new Error("O bridge desktop não refletiu corretamente as capacidades do operador reativo.");
    await operatorSession.connection.reducers.logSystemEvent({ cameraId: Number(camera.id), type: "health", severity: "warning", message: "Teste de evento operacional" });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const operationalEvent = Array.from(operatorSession.connection.db.events.iter()).find((entry: any) => entry.message === "Teste de evento operacional") as any;
    if (!operationalEvent) throw new Error("O operador não conseguiu registrar o evento autorizado.");
    await operatorSession.connection.reducers.acknowledgeEvent({ id: Number(operationalEvent.id) });
    await connection.reducers.logAnalysisEvent({ cameraId: Number(camera.id), task: "objects", classification: "pessoa para revisão por operador", confidence: "0.91", evidenceRef: "desktop-role-validation", reviewRequired: true });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const desktopReviewEvent = Array.from(operatorSession.connection.db.analysisEvents.iter()).find((entry: any) => entry.classification === "pessoa para revisão por operador") as any;
    if (!desktopReviewEvent || desktopReviewEvent.reviewed) throw new Error("A fila reativa não entregou ao operador o evento de revisão desktop.");
    await operatorSession.connection.reducers.reviewAnalysisEvent({ id: Number(desktopReviewEvent.id), decision: "approved" });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const operatorReviewedDesktopEvent = Array.from(connection.db.analysisEvents.iter()).find((entry: any) => Number(entry.id) === Number(desktopReviewEvent.id)) as any;
    if (!operatorReviewedDesktopEvent?.reviewed) throw new Error("O operador não conseguiu concluir a revisão reativa exibida pelo desktop.");

    auditorSession = await connect();
    await auditorSession.connection.reducers.registerViewer({ displayName: "Auditor de validação" });
    await new Promise((resolve) => setTimeout(resolve, 80));
    await connection.reducers.setActorRole({ identity: auditorSession.identity, role: "auditor" });
    await applySubscription(auditorSession.connection);
    const auditorDesktopRole = resolveDesktopRole(auditorSession.connection.db.actors.iter(), String(auditorSession.identity));
    if (auditorDesktopRole !== "auditor" || can(auditorDesktopRole, "review_analysis") || can(auditorDesktopRole, "manage_biometrics")) throw new Error("O bridge desktop não refletiu corretamente as capacidades do auditor reativo.");
    let auditorBlocked = false;
    try {
      await auditorSession.connection.reducers.acknowledgeEvent({ id: Number(operationalEvent.id) });
    } catch {
      auditorBlocked = true;
    }
    if (!auditorBlocked) throw new Error("O auditor não foi bloqueado ao tentar reconhecer um evento.");
    await auditorSession.connection.reducers.markEvidenceExported({ id: Number(evidence.id), signedExportRef: signedFixture.manifestPath, signatureAlgorithm: signedFixture.algorithm });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const exportedEvidence = Array.from(connection.db.evidenceRecords.iter())[0] as any;
    if (!exportedEvidence?.exportedAt || exportedEvidence.signatureAlgorithm !== "Ed25519" || exportedEvidence.signedExportRef !== signedFixture.manifestPath) throw new Error("A exportação Ed25519 da evidência não foi persistida.");

    technicianSession = await connect();
    await technicianSession.connection.reducers.registerViewer({ displayName: "Técnico de validação" });
    await new Promise((resolve) => setTimeout(resolve, 80));
    await connection.reducers.setActorRole({ identity: technicianSession.identity, role: "technician" });
    await applySubscription(technicianSession.connection);
    const technicianDesktopRole = resolveDesktopRole(technicianSession.connection.db.actors.iter(), String(technicianSession.identity));
    if (technicianDesktopRole !== "technician" || can(technicianDesktopRole, "review_analysis") || can(technicianDesktopRole, "manage_biometrics")) throw new Error("O bridge desktop não refletiu corretamente as capacidades do técnico reativo.");
    await technicianSession.connection.reducers.reportCameraHealth({ cameraId: Number(camera.id), success: false, maintenanceNote: "Inspeção preventiva solicitada", maintenanceStatus: "scheduled", maintenanceDueAt: undefined });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const health = Array.from(technicianSession.connection.db.cameraHealth.iter()).find((entry: any) => Number(entry.cameraId) === Number(camera.id)) as any;
    if (!health || Number(health.consecutiveFailures) !== 1 || health.maintenanceNote !== "Inspeção preventiva solicitada") throw new Error("O relatório de saúde técnica não foi registrado.");
    let technicianBlocked = false;
    try {
      await technicianSession.connection.reducers.acknowledgeEvent({ id: Number(operationalEvent.id) });
    } catch {
      technicianBlocked = true;
    }
    if (!technicianBlocked) throw new Error("O técnico não foi bloqueado ao tentar reconhecer um evento.");

    viewerSession = await connect();
    await viewerSession.connection.reducers.registerViewer({ displayName: "Visualizador de validação" });
    await applySubscription(viewerSession.connection);
    const viewerDesktopRole = resolveDesktopRole(viewerSession.connection.db.actors.iter(), String(viewerSession.identity));
    if (viewerDesktopRole !== "viewer" || can(viewerDesktopRole, "review_analysis") || can(viewerDesktopRole, "manage_biometrics")) throw new Error("O bridge desktop não refletiu corretamente as capacidades do visualizador reativo.");
    let viewerBlocked = false;
    try {
      await viewerSession.connection.reducers.logSystemEvent({ cameraId: Number(camera.id), type: "health", severity: "warning", message: "Ação proibida ao visualizador" });
    } catch {
      viewerBlocked = true;
    }
    if (!viewerBlocked) throw new Error("O visualizador não foi bloqueado ao tentar registrar um evento.");
    let viewerReviewBlocked = false;
    try {
      await viewerSession.connection.reducers.reviewAnalysisEvent({ id: Number(desktopReviewEvent.id), decision: "rejected" });
    } catch {
      viewerReviewBlocked = true;
    }
    if (!viewerReviewBlocked) throw new Error("O visualizador não foi bloqueado ao tentar revisar a análise desktop.");
    let operatorBiometricBlocked = false;
    try {
      await operatorSession.connection.reducers.setBiometricControls({ faceRecognitionEnabled: true, emotionalSignalEnabled: false, consentRecorded: true, humanReviewRequired: true, retentionDays: 7 });
    } catch {
      operatorBiometricBlocked = true;
    }
    if (!operatorBiometricBlocked) throw new Error("O operador não foi bloqueado na governança biométrica reativa.");

    await connection.reducers.setRetentionPolicy({ cameraId: Number(camera.id), retentionDays: 0, quality: "1080p", recordingMode: "motion" });
    await new Promise((resolve) => setTimeout(resolve, 80));
    await connection.reducers.enforceDataRetention();
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (Array.from(connection.db.analysisEvents.iter()).some((entry: any) => Number(entry.id) === Number(reviewed.id))) throw new Error("A retenção não removeu o evento analítico expirado.");
    if (Array.from(connection.db.evidenceRecords.iter()).some((entry: any) => Number(entry.id) === Number(evidence.id))) throw new Error("A retenção não removeu a evidência expirada.");
    const auditActions = (Array.from(connection.db.auditLogs.iter()) as any[]).filter((entry) => String(entry.actor) === String(operatorSession.identity)).map((entry) => entry.action);
    if (!auditActions.includes("system_event_logged") || !auditActions.includes("event_acknowledged")) throw new Error("As ações autorizadas do operador não geraram a trilha de auditoria esperada.");
    const allAuditActions = (Array.from(connection.db.auditLogs.iter()) as any[]).map((entry) => entry.action);
    for (const expectedAction of ["evidence_hashed", "evidence_exported", "camera_health_reported", "retention_enforced"]) if (!allAuditActions.includes(expectedAction)) throw new Error(`Ação auditável ausente: ${expectedAction}`);
    console.log(JSON.stringify({ ok: true, removedAnalysisEventId: Number(reviewed.id), removedEvidenceId: Number(evidence.id), auditCount: Array.from(connection.db.auditLogs.iter()).length, cameraId: Number(camera.id), classification: reviewed.classification, operatorAuditActions: auditActions, auditorBlocked, technicianBlocked, viewerBlocked, viewerReviewBlocked, operatorBiometricBlocked, desktopIdentityRoles: { operator: operatorDesktopRole, auditor: auditorDesktopRole, technician: technicianDesktopRole, viewer: viewerDesktopRole }, desktopReviewApprovedByOperator: true, technicianHealthFailureCount: Number(health.consecutiveFailures), retentionDeletionVerified: true, signedEvidenceChainVerified: true, signatureAlgorithm: signedFixture.algorithm }));
  } finally {
    operatorSession?.connection.disconnect();
    auditorSession?.connection.disconnect();
    technicianSession?.connection.disconnect();
    viewerSession?.connection.disconnect();
    connection.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
