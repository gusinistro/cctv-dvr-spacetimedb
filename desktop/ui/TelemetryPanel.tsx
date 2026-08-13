import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export type TelemetrySummary = {
  enabled: boolean;
  retentionHours: number;
  eventCount: number;
  successfulRtspProbes: number;
  failedRtspProbes: number;
  averageProbeLatencyMillis: number;
};

export function TelemetryPanel({ summary, onSummary }: { summary: TelemetrySummary; onSummary: (value: TelemetrySummary) => void }) {
  const [draft, setDraft] = useState(summary);
  useEffect(() => setDraft(summary), [summary]);

  async function save() {
    const saved = await invoke<TelemetrySummary>("save_telemetry_settings", { settings: { enabled: draft.enabled, retentionHours: draft.retentionHours } });
    onSummary({ ...saved, eventCount: saved.enabled ? summary.eventCount : 0 });
  }

  return <section className="panel"><h2>Telemetria local opcional</h2><p>Armazena apenas totais técnicos de diagnósticos RTSP nesta estação. Endpoints, credenciais, frames, OCR e biometria não são coletados.</p><label className="switch"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><span />Ativar métricas técnicas locais</label><label>Retenção em horas<input type="number" min="1" max="720" value={draft.retentionHours} onChange={(event) => setDraft({ ...draft, retentionHours: Number(event.target.value) })} /></label><button className="primary" onClick={() => void save()}>Salvar telemetria</button><div className="probe ok"><strong>{summary.eventCount} registro(s) técnico(s)</strong><span>{summary.successfulRtspProbes} sucesso(s), {summary.failedRtspProbes} falha(s), média RTSP {summary.averageProbeLatencyMillis} ms</span></div></section>;
}
