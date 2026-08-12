import { DbConnection, tables } from "../client/src/lib/spacetimedb-bindings";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const uri = process.env.SPACETIMEDB_URI ?? "ws://127.0.0.1:3001";
const databaseName = process.env.SPACETIMEDB_DATABASE ?? "spacevision-analysis-test";

function connect() {
  return new Promise<any>((resolve, reject) => {
    DbConnection.builder().withUri(uri).withDatabaseName(databaseName).onConnect((connection) => resolve(connection)).onConnectError((error) => reject(new Error(`Falha de conexão: ${String(error)}`))).build();
  });
}

function applySubscription(connection: any) {
  return new Promise<void>((resolve) => {
    connection.subscriptionBuilder().onApplied(() => resolve()).subscribe([tables.cameras, tables.analysisEvents, tables.auditLogs, tables.biometricControls]);
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

async function main() {
  const connection = await connect();
  try {
    await connection.reducers.bootstrapAdmin({ displayName: "Validação Desktop" });
    await applySubscription(connection);
    const camera = Array.from(connection.db.cameras.iter())[0] as any;
    if (!camera) throw new Error("Nenhuma câmera semeada para validação.");
    const workerResult = runWorkerFixture();
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
    console.log(JSON.stringify({ ok: true, analysisEventId: Number(reviewed.id), auditCount, cameraId: Number(reviewed.cameraId), classification: reviewed.classification }));
  } finally {
    connection.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
