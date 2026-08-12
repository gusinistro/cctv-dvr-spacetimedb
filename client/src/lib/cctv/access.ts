import type { EventFilters, OperationalCapability, SystemEvent, UserRole } from "./types";

const capabilities: Record<UserRole, OperationalCapability[]> = {
  admin: ["live_view", "export", "acknowledge", "review_analysis", "manage_cameras", "manage_retention", "manage_roles", "manage_biometrics", "diagnostics"],
  operator: ["live_view", "export", "acknowledge", "review_analysis", "diagnostics"],
  auditor: ["live_view", "export"],
  technician: ["live_view", "diagnostics"],
  viewer: ["live_view"],
};

export function can(role: UserRole, capability: OperationalCapability) {
  return capabilities[role].includes(capability);
}

export function canManage(role: UserRole) {
  return can(role, "manage_cameras") || can(role, "manage_retention");
}

export function filterEvents(events: SystemEvent[], filters: EventFilters) {
  const from = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : -Infinity;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999`).getTime() : Infinity;

  return events.filter((event) => {
    const cameraMatch = filters.cameraId === "all" || event.cameraId === Number(filters.cameraId);
    const typeMatch = filters.eventType === "all" || event.type === filters.eventType;
    return cameraMatch && typeMatch && event.occurredAt >= from && event.occurredAt <= to;
  });
}
