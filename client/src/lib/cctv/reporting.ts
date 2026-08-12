import type { Camera, SystemEvent } from "./types";

function eventSeverityLabel(severity: SystemEvent["severity"]) {
  return { critical: "Crítico", warning: "Atenção", info: "Informativo" }[severity];
}

export function buildCsvContent(events: SystemEvent[], cameras: Camera[]) {
  const cameraName = new Map(cameras.map((camera) => [camera.id, camera.name]));
  const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const rows = [
    ["Data", "Câmera", "Tipo", "Severidade", "Mensagem", "Reconhecido"],
    ...events.map((event) => [
      dateFormatter.format(event.occurredAt),
      event.cameraId ? cameraName.get(event.cameraId) ?? "-" : "Sistema",
      event.type,
      eventSeverityLabel(event.severity),
      event.message,
      event.acknowledged ? "Sim" : "Não",
    ]),
  ];
  return `\ufeff${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n")}`;
}

export function buildPdfRows(events: SystemEvent[], cameras: Camera[]) {
  const cameraName = new Map(cameras.map((camera) => [camera.id, camera.name]));
  const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
  return events.map((event) => ({
    severity: event.severity,
    severityLabel: eventSeverityLabel(event.severity),
    type: event.type,
    occurredAtLabel: dateFormatter.format(event.occurredAt),
    cameraName: event.cameraId ? cameraName.get(event.cameraId) ?? "Câmera" : "Sistema",
    message: event.message,
    acknowledged: event.acknowledged,
  }));
}
