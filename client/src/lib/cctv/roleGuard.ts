import type { CctvCommands, UserRole } from "./types";

export function guardCommands(role: UserRole, commands: CctvCommands): CctvCommands {
  const assertCapability = (capability: OperationalCapability) => {
    if (!can(role, capability)) throw new Error("Ação restrita ao papel necessário.");
  };

  return {
    async upsertInstallation(input) { assertCapability("manage_cameras"); return commands.upsertInstallation(input); },
    async upsertCamera(input) { assertCapability("manage_cameras"); return commands.upsertCamera(input); },
    async setRetention(policy) { assertCapability("manage_retention"); return commands.setRetention(policy); },
    async acknowledgeEvent(id) { assertCapability("acknowledge"); return commands.acknowledgeEvent(id); },
    async setCameraStatus(id, status) { assertCapability("manage_cameras"); return commands.setCameraStatus(id, status); },
  };
}
import { can } from "./access";
import type { OperationalCapability } from "./types";
