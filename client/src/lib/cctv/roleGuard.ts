import type { CctvCommands, UserRole } from "./types";

export function guardCommands(role: UserRole, commands: CctvCommands): CctvCommands {
  const assertAdmin = () => {
    if (role !== "admin") throw new Error("Ação restrita ao papel admin.");
  };

  return {
    async upsertCamera(input) { assertAdmin(); return commands.upsertCamera(input); },
    async setRetention(policy) { assertAdmin(); return commands.setRetention(policy); },
    async acknowledgeEvent(id) { assertAdmin(); return commands.acknowledgeEvent(id); },
    async setCameraStatus(id, status) { assertAdmin(); return commands.setCameraStatus(id, status); },
  };
}
