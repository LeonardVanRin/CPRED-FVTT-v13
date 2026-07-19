import { test, expect } from "../fixtures.mjs";

/*
 * Unit test for migration 042 (AddDamageCritConfig): it backfills the configurable damage-crit fields
 * on weapons (system.damageCrit) and ammo (system.overrides.crit) with RAW defaults, and is idempotent
 * (it never clobbers values that are already present).
 */

test("042 migration backfills damage-crit fields, idempotently", async ({
  game,
}) => {
  const out = await game.evaluate(async () => {
    const M = await import(
      `/systems/${game.system.id}/modules/system/migrate/scripts/042-add-damage-crit-config.js`
    );
    const migration = new M.default();

    const weapon = { type: "weapon", system: {} };
    const ammo = { type: "ammo", system: { overrides: {} } };
    const weaponWithExisting = {
      type: "weapon",
      system: { damageCrit: { threshold: 5, count: 3, bonus: 10 } },
    };

    await migration.updateItem(weapon);
    await migration.updateItem(ammo);
    await migration.updateItem(weaponWithExisting);

    return {
      version: M.default.version,
      weaponCrit: weapon.system.damageCrit,
      ammoCrit: ammo.system.overrides.crit,
      preserved: weaponWithExisting.system.damageCrit,
    };
  });

  expect(out.version).toBe(42);
  expect(out.weaponCrit).toEqual({ threshold: 0, count: 2, bonus: 5 });
  expect(out.ammoCrit).toEqual({
    override: false,
    threshold: 0,
    count: 2,
    bonus: 5,
  });
  // Existing config must not be overwritten.
  expect(out.preserved).toEqual({ threshold: 5, count: 3, bonus: 10 });
});

test("042 migration forces no-crit weapons/ammo to never crit, by name and translation", async ({
  game,
}) => {
  const out = await game.evaluate(async () => {
    const M = await import(
      `/systems/${game.system.id}/modules/system/migrate/scripts/042-add-damage-crit-config.js`
    );
    const migration = new M.default();

    // Weapons that RAW cannot crit: English, a Babele translation, and a DLC weapon.
    const stunGun = { type: "weapon", name: "Stun Gun", system: {} };
    const stunGunDe = { type: "weapon", name: "Betäubungspistole", system: {} };
    const subFlechette = {
      type: "weapon",
      name: "Sub-Flechette Gun",
      system: {},
    };
    // A no-crit weapon that already carries a (non-default) crit config must still be forced to 0.
    const airPistolWithCrit = {
      type: "weapon",
      name: "Air Pistol",
      system: { damageCrit: { threshold: 5, count: 3, bonus: 10 } },
    };

    // Rubber ammo that RAW cannot crit: English and a Babele translation.
    const rubberSlug = {
      type: "ammo",
      name: "Shotgun Slug (Rubber)",
      system: { overrides: {} },
    };
    const rubberArrowJa = {
      type: "ammo",
      name: "矢（ゴム弾）",
      system: { overrides: {} },
    };

    await migration.updateItem(stunGun);
    await migration.updateItem(stunGunDe);
    await migration.updateItem(subFlechette);
    await migration.updateItem(airPistolWithCrit);
    await migration.updateItem(rubberSlug);
    await migration.updateItem(rubberArrowJa);

    return {
      stunGun: stunGun.system.damageCrit,
      stunGunDe: stunGunDe.system.damageCrit,
      subFlechette: subFlechette.system.damageCrit,
      airPistolWithCrit: airPistolWithCrit.system.damageCrit,
      rubberSlug: rubberSlug.system.overrides.crit,
      rubberArrowJa: rubberArrowJa.system.overrides.crit,
    };
  });

  // Weapons: damageCrit.count forced to 0 (never crit).
  expect(out.stunGun).toEqual({ threshold: 0, count: 0, bonus: 5 });
  expect(out.stunGunDe).toEqual({ threshold: 0, count: 0, bonus: 5 });
  expect(out.subFlechette).toEqual({ threshold: 0, count: 0, bonus: 5 });
  // Unconditional: even a pre-existing crit config is overridden to never crit.
  expect(out.airPistolWithCrit).toEqual({ threshold: 0, count: 0, bonus: 5 });
  // Ammo: overrides.crit set to override the loaded weapon to never crit.
  expect(out.rubberSlug).toEqual({
    override: true,
    threshold: 0,
    count: 0,
    bonus: 5,
  });
  expect(out.rubberArrowJa).toEqual({
    override: true,
    threshold: 0,
    count: 0,
    bonus: 5,
  });
});
