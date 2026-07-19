import { stopServer } from "../../tools/foundry-server/server.mjs";
import {
  resolveConfig,
  readWorldId,
  clearWorldId,
  removeWorld,
} from "../../tools/foundry-server/config.mjs";

/*
 * Runs once after the suite. Stops Foundry FIRST (a clean, awaited shutdown that
 * releases the exclusive LevelDB locks), THEN deletes the ephemeral world — the
 * order matters because the world's databases are locked while the server runs.
 */
export default async function globalTeardown() {
  await stopServer();

  const worldId = readWorldId();
  if (worldId) {
    const { dataPath } = resolveConfig();
    await removeWorld(dataPath, worldId);
    clearWorldId();
  }
}
