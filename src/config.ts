import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-finger-relay",
  description: "Collaborative finger painting; 3 seconds per turn, rotating.",
  accentHex: "#aa66ff",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
