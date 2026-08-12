import type { EventFilters, SystemEvent, UserRole } from "./types";

export function canManage(role: UserRole) {
  return role === "admin";
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
