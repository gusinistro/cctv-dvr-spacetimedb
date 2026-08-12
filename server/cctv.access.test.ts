import { describe, expect, it, vi } from "vitest";
import { canManage, filterEvents } from "../client/src/lib/cctv/access";
import { guardCommands } from "../client/src/lib/cctv/roleGuard";
import { createCctvStoreFromConnection, resolveSpacetimeConnection } from "../client/src/lib/cctv/spacetime";
import { buildCsvContent, buildPdfRows } from "../client/src/lib/cctv/reporting";
import type { CctvCommands, SystemEvent } from "../client/src/lib/cctv/types";

const events: SystemEvent[] = [
  { id: 1, cameraId: 2, type: "motion", severity: "warning", message: "Movimento", occurredAt: new Date("2026-08-10T10:00:00Z").getTime(), acknowledged: false },
  { id: 2, cameraId: 5, type: "offline", severity: "critical", message: "Offline", occurredAt: new Date("2026-08-11T10:00:00Z").getTime(), acknowledged: false },
  { id: 3, cameraId: null, type: "storage", severity: "info", message: "Disco", occurredAt: new Date("2026-08-12T10:00:00Z").getTime(), acknowledged: true },
];

describe("controle de acesso e filtros do CCTV", () => {
  it("reconhece apenas o papel admin como gestor", () => {
    expect(canManage("admin")).toBe(true);
    expect(canManage("viewer")).toBe(false);
  });

  it("filtra ocorrências pelo conjunto compartilhado de câmera, tipo e período", () => {
    expect(filterEvents(events, { cameraId: "2", eventType: "motion", from: "2026-08-10", to: "2026-08-10" })).toEqual([events[0]]);
    expect(filterEvents(events, { cameraId: "all", eventType: "storage", from: "", to: "" })).toEqual([events[2]]);
    expect(filterEvents(events, { cameraId: "all", eventType: "all", from: "2026-08-12", to: "2026-08-12" })).toEqual([events[2]]);
  });

  it("bloqueia mutações do simulador para viewers e encaminha mutações de admins", async () => {
    const commands: CctvCommands = {
      upsertCamera: vi.fn().mockResolvedValue(undefined),
      setRetention: vi.fn().mockResolvedValue(undefined),
      acknowledgeEvent: vi.fn().mockResolvedValue(undefined),
      setCameraStatus: vi.fn().mockResolvedValue(undefined),
    };
    await expect(guardCommands("viewer", commands).acknowledgeEvent(1)).rejects.toThrow("restrita ao papel admin");
    await guardCommands("admin", commands).acknowledgeEvent(1);
    expect(commands.acknowledgeEvent).toHaveBeenCalledWith(1);
  });

  it("resolve automaticamente a instância local e mantém fallback sem destino em produção", () => {
    expect(resolveSpacetimeConnection({ development: true })).toEqual({ uri: "ws://127.0.0.1:3001", database: "spacevision-dvr-local" });
    expect(resolveSpacetimeConnection({ uri: "wss://cctv.example", database: "dvr-prod", development: true })).toEqual({ uri: "wss://cctv.example", database: "dvr-prod" });
    expect(resolveSpacetimeConnection({ development: false })).toEqual({ uri: undefined, database: undefined });
  });

  it("cria efetivamente o simulador quando nenhuma conexão SpacetimeDB é resolvida", () => {
    const store = createCctvStoreFromConnection({});
    expect(store.getSnapshot().source).toBe("demo");
    expect(store.getSnapshot().cameras).toHaveLength(8);
    store.dispose();
  });

  it("gera CSV somente para o conjunto de eventos já filtrado", () => {
    const cameras = [{ id: 2, name: "Recepção", location: "Lobby", zone: "Lobby", protocol: "RTSP" as const, streamUrl: "rtsp://simulado", status: "online" as const, motion: false, scene: "day" as const }];
    const csv = buildCsvContent([events[0]], cameras);
    expect(csv).toContain("Movimento");
    expect(csv).toContain("Recepção");
    expect(csv).not.toContain("Offline");
    expect(csv).not.toContain("Disco");
  });

  it("prepara o PDF somente para o mesmo conjunto de eventos filtrado", () => {
    const cameras = [{ id: 2, name: "Recepção", location: "Lobby", zone: "Lobby", protocol: "RTSP" as const, streamUrl: "rtsp://simulado", status: "online" as const, motion: false, scene: "day" as const }];
    const rows = buildPdfRows([events[0]], cameras);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cameraName: "Recepção", message: "Movimento", severityLabel: "Atenção" });
  });
});
