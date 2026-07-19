import { test, expect } from "../fixtures.mjs";

/*
 * The `dmg`/`ab`/`cd` markers are built from an item's own crit / ablation settings, and `red` conflicts
 * with the auto-appended `dmg`, so none may be hand-entered into a damage field. The sanitize-item-damage
 * hook strips them (while keeping every other modifier) on update — for EVERY attackable item type
 * (`system.damage`) and for ammo overrides (`system.overrides.damage.value`). These specs drive the
 * update through the real `preUpdateItem` path and read the stored value back.
 */

// Create a world item of `type`, update `field` to `input`, return the stored value, then delete.
async function updateField(page, type, field, input) {
  return page.evaluate(
    async ({ type, field, input }) => {
      const item = await Item.create({ name: `sanitest-${type}`, type });
      try {
        await item.update({ [field]: input });
        return foundry.utils.getProperty(item, field);
      } finally {
        await item.delete();
      }
    },
    { type, field, input },
  );
}

test("strips dmg/ab/cd/red from the Damage field of every attackable item type, keeping other modifiers", async ({
  game,
}) => {
  const results = await game.evaluate(async () => {
    const types = Object.keys(CONFIG.Item.dataModels).filter((t) =>
      (CONFIG.Item.dataModels[t].mixins ?? []).includes("attackable"),
    );
    // Distinct items → run the create/update/delete per type in parallel (no await-in-loop).
    const stored = await Promise.all(
      types.map(async (type) => {
        const item = await Item.create({ name: `sanitest-${type}`, type });
        try {
          await item.update({ "system.damage": "3d6kh2dmg5ab0cd10red" });
          return { type, damage: item.system.damage };
        } finally {
          await item.delete();
        }
      }),
    );
    return { types, stored };
  });

  // Guard against the predicate silently matching nothing (which would make the test vacuously pass).
  expect(results.types.length).toBeGreaterThan(0);
  for (const r of results.stored) {
    expect(r.damage, `attackable type "${r.type}"`).toBe("3d6kh2");
  }
});

test("strips the markers from an ammo damage override", async ({ game }) => {
  expect(
    await updateField(
      game,
      "ammo",
      "system.overrides.damage.value",
      "2d6dmg5ab0cd10red",
    ),
  ).toBe("2d6");
});

test("still fires updateItem when the cleaned value equals the stored one (so the sheet re-renders)", async ({
  game,
}) => {
  // Appending a marker to an already-clean formula cleans back to the stored value, so the update
  // would be a no-op that Foundry skips — leaving the raw text in the sheet field until it is
  // reopened. The hook forces the write (`options.diff = false`) so updateItem fires and the sheet
  // re-renders with the sanitised value. Guard that the write is still forced.
  const result = await game.evaluate(async () => {
    const item = await Item.create({
      name: "sanitest-noop",
      type: "weapon",
      system: { damage: "3d6kh2" },
    });
    let fired = false;
    const hookId = Hooks.on("updateItem", (doc) => {
      if (doc.id === item.id) fired = true;
    });
    try {
      await item.update({ "system.damage": "3d6kh2red" });
      return { fired, stored: item.system.damage };
    } finally {
      Hooks.off("updateItem", hookId);
      await item.delete();
    }
  });
  expect(result.stored).toBe("3d6kh2");
  expect(result.fired).toBe(true);
});

test("leaves a marker-free damage formula untouched", async ({ game }) => {
  expect(await updateField(game, "weapon", "system.damage", "3d6kh2")).toBe(
    "3d6kh2",
  );
  expect(
    await updateField(game, "weapon", "system.damage", "2d6 + @stats.body"),
  ).toBe("2d6 + @stats.body");
  expect(
    await updateField(game, "ammo", "system.overrides.damage.value", "2d6 + 2"),
  ).toBe("2d6 + 2");
});
