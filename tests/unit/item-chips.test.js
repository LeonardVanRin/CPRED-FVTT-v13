import { describe, it, expect, beforeEach } from "vitest";

import {
  buildItemChips,
  buildItemBreadcrumb,
} from "../../src/modules/item/item-chips.js";

/**
 * Tier-2 unit test for the pure `item-chips.js` module.
 *
 * The module localizes chip/breadcrumb strings through `SystemUtils.Localize` /
 * `SystemUtils.Format`, which delegate to `game.i18n`. We install a DETERMINISTIC
 * i18n stub below so we can assert exact interpolated strings. The stub knows the
 * pinned `CPR.browser.chip.*` labels (the shared contract with the implementation
 * agent); every other key — the `CPR.*` enum-map values used by the breadcrumb —
 * is echoed back verbatim, so breadcrumb segments equal their config-map key.
 *
 * The chip builder reads an item type's MIXINS via `SystemUtils.getMixins(type)`,
 * which resolves `CONFIG.Item.dataModels[type].mixins`. We populate that map in
 * `beforeEach` with each representative type's real (common-filtered) mixin list.
 */

// Pinned chip templates: value chips carry `{value}`, flag chips are bare labels.
const CHIP_TEMPLATES = {
  "CPR.browser.chip.damage": "Damage {value}",
  "CPR.browser.chip.rof": "ROF {value}",
  "CPR.browser.chip.autofire": "Autofire {value}",
  "CPR.browser.chip.attackMod": "Attack Mod {value}",
  "CPR.browser.chip.magazine": "Magazine {value}",
  "CPR.browser.chip.hands": "Hands {value}",
  "CPR.browser.chip.headSp": "Head SP {value}",
  "CPR.browser.chip.bodySp": "Body SP {value}",
  "CPR.browser.chip.shieldHp": "Shield HP {value}",
  "CPR.browser.chip.penalty": "Penalty {value}",
  "CPR.browser.chip.humanityLoss": "{value} HL",
  "CPR.browser.chip.install": "Install {value}",
  "CPR.browser.chip.slots": "Slots {value}",
  "CPR.browser.chip.upgradeSlots": "Slots {value}",
  "CPR.browser.chip.ablation": "Ablation {value}",
  "CPR.browser.chip.quickFixDv": "Quick Fix DV {value}",
  "CPR.browser.chip.treatmentDv": "Treatment DV {value}",
  "CPR.browser.chip.atk": "ATK {value}",
  "CPR.browser.chip.def": "DEF {value}",
  "CPR.browser.chip.rez": "REZ {value}",
  "CPR.browser.chip.per": "PER {value}",
  "CPR.browser.chip.spd": "SPD {value}",
  "CPR.browser.chip.rank": "Rank {value}",
  "CPR.browser.chip.level": "Level {value}",
  "CPR.browser.chip.stat": "Stat {value}",
  "CPR.browser.chip.seats": "Seats {value}",
  "CPR.browser.chip.sdp": "SDP {value}",
  "CPR.browser.chip.combatSpeed": "Combat Speed {value}",
  "CPR.browser.chip.floors": "Floors {value}",
  // Flag chips (bare label, no value)
  "CPR.browser.chip.concealable": "Concealable",
  "CPR.browser.chip.suppressiveFire": "Suppressive Fire",
  "CPR.browser.chip.foundational": "Foundational",
  "CPR.browser.chip.electronic": "Electronic",
  "CPR.browser.chip.providingHardening": "Providing Hardening",
  "CPR.browser.chip.deathSaveIncrease": "Death Save Increase",
};

// Real, common-filtered mixin lists per item type (see datamodels/item/*).
const MIXINS = {
  weapon: [
    "attackable",
    "container",
    "effects",
    "equippable",
    "loadable",
    "physical",
    "quality",
    "upgradable",
    "valuable",
  ],
  armor: [
    "container",
    "effects",
    "electronic",
    "equippable",
    "physical",
    "upgradable",
    "valuable",
  ],
  cyberware: [
    "attackable",
    "container",
    "effects",
    "electronic",
    "installable",
    "loadable",
    "physical",
    "upgradable",
    "valuable",
  ],
  ammo: ["installable", "physical", "stackable", "valuable"],
  program: ["effects", "installable", "valuable"],
  criticalInjury: ["effects"],
  role: [],
  skill: [],
  vehicle: ["container", "physical", "upgradable", "valuable"],
  netarch: ["valuable"],
  gear: [
    "container",
    "effects",
    "electronic",
    "equippable",
    "physical",
    "stackable",
    "upgradable",
    "valuable",
  ],
  cyberdeck: [
    "container",
    "electronic",
    "equippable",
    "installable",
    "physical",
    "quality",
    "upgradable",
    "valuable",
  ],
  clothing: [
    "container",
    "effects",
    "electronic",
    "equippable",
    "physical",
    "stackable",
    "upgradable",
    "valuable",
  ],
  itemUpgrade: [
    "attackable",
    "container",
    "effects",
    "electronic",
    "installable",
    "loadable",
    "physical",
    "valuable",
  ],
};

// Assert `a` and `b` are both present and `a` precedes `b`.
const expectOrder = (chips, a, b) => {
  expect(chips).toContain(a);
  expect(chips).toContain(b);
  expect(chips.indexOf(a)).toBeLessThan(chips.indexOf(b));
};

beforeEach(() => {
  // Deterministic i18n: pinned chip labels resolve to their template; every other
  // key (breadcrumb enum-map values) echoes back so segments equal the config key.
  const interp = (template, data) =>
    template.replace(/\{(\w+)\}/g, (_m, k) =>
      k in data ? String(data[k]) : `{${k}}`,
    );
  globalThis.game.i18n = {
    localize: (key) => CHIP_TEMPLATES[key] ?? key,
    format: (key, data = {}) => interp(CHIP_TEMPLATES[key] ?? key, data),
  };

  // Mixin lookup surface consumed by SystemUtils.getMixins(type).
  globalThis.CONFIG.Item = {
    dataModels: Object.fromEntries(
      Object.entries(MIXINS).map(([type, mixins]) => [type, { mixins }]),
    ),
  };
});

describe("buildItemChips — weapon", () => {
  const base = () => ({
    type: "weapon",
    system: {
      damage: "2d6",
      rof: 2,
      fireModes: { autoFire: 4, suppressiveFire: true },
      attackmod: 1,
      handsReq: 1,
      magazine: { max: 30, value: 10 },
      concealable: { concealable: true },
      installedItems: { usedSlots: 1, slots: 3 },
    },
  });

  it("surfaces the curated weapon headline stats", () => {
    const chips = buildItemChips(base());
    expect(chips).toContain("Damage 2d6");
    expect(chips).toContain("ROF 2");
    expect(chips).toContain("Autofire 4");
    expect(chips).toContain("Suppressive Fire");
    expect(chips).toContain("Attack Mod 1");
    expect(chips).toContain("Hands 1");
    expect(chips).toContain("Magazine 30");
    expect(chips).toContain("Concealable");
    expect(chips).toContain("Slots 1/3");
  });

  it("orders the attackable chips Damage, ROF, Autofire, Suppressive Fire, Attack Mod", () => {
    const chips = buildItemChips(base());
    expectOrder(chips, "Damage 2d6", "ROF 2");
    expectOrder(chips, "ROF 2", "Autofire 4");
    expectOrder(chips, "Autofire 4", "Suppressive Fire");
    expectOrder(chips, "Suppressive Fire", "Attack Mod 1");
  });

  it("omits non-headline stats", () => {
    const chips = buildItemChips(base());
    expect(chips.some((c) => c.startsWith("SDP"))).toBe(false);
    expect(chips.some((c) => c.startsWith("REZ"))).toBe(false);
    expect(chips.some((c) => c.startsWith("Penalty"))).toBe(false);
    expect(chips.some((c) => c.startsWith("Seats"))).toBe(false);
  });

  it("drops Autofire when it is not greater than zero", () => {
    const src = base();
    src.system.fireModes.autoFire = 0;
    const chips = buildItemChips(src);
    expect(chips.some((c) => c.startsWith("Autofire"))).toBe(false);
  });

  it("drops the Suppressive Fire flag when false", () => {
    const src = base();
    src.system.fireModes.suppressiveFire = false;
    expect(buildItemChips(src)).not.toContain("Suppressive Fire");
  });

  it("drops the Concealable flag when false", () => {
    const src = base();
    src.system.concealable.concealable = false;
    expect(buildItemChips(src)).not.toContain("Concealable");
  });

  it("drops Attack Mod when zero", () => {
    const src = base();
    src.system.attackmod = 0;
    const chips = buildItemChips(src);
    expect(chips.some((c) => c.startsWith("Attack Mod"))).toBe(false);
  });

  it("shows a negative Attack Mod chip", () => {
    const src = base();
    src.system.attackmod = -1;
    const chips = buildItemChips(src);
    expect(chips).toContain("Attack Mod -1");
  });

  it("drops the Slots chip when there are no slots", () => {
    const src = base();
    src.system.installedItems = { usedSlots: 0, slots: 0 };
    const chips = buildItemChips(src);
    expect(chips.some((c) => c.startsWith("Slots"))).toBe(false);
  });
});

describe("buildItemChips — armor", () => {
  const bodyHead = () => ({
    type: "armor",
    system: {
      isBodyLocation: true,
      isHeadLocation: true,
      isShield: false,
      bodyLocation: { sp: 7, ablation: 0 },
      headLocation: { sp: 11, ablation: 2 },
      shieldHitPoints: { value: 10, max: 10 },
      penalty: 0,
      isElectronic: false,
      providesHardening: false,
    },
  });

  it("renders Head/Body SP as current/max, Head before Body", () => {
    const chips = buildItemChips(bodyHead());
    // headLocation.sp 11 - ablation 2 => 9 current, 11 max.
    expect(chips).toContain("Head SP 9/11");
    // bodyLocation.sp 7 - ablation 0 => 7 current, 7 max.
    expect(chips).toContain("Body SP 7/7");
    expectOrder(chips, "Head SP 9/11", "Body SP 7/7");
  });

  it("drops the Shield HP chip for non-shield armor", () => {
    const chips = buildItemChips(bodyHead());
    expect(chips.some((c) => c.startsWith("Shield HP"))).toBe(false);
  });

  it("omits Penalty when zero and shows it when non-zero", () => {
    const zero = buildItemChips(bodyHead());
    expect(zero.some((c) => c.startsWith("Penalty"))).toBe(false);

    const src = bodyHead();
    src.system.penalty = -2;
    expect(buildItemChips(src)).toContain("Penalty -2");
  });

  it("renders a shield's Shield HP as value/max and no SP chips", () => {
    const chips = buildItemChips({
      type: "armor",
      system: {
        isBodyLocation: false,
        isHeadLocation: false,
        isShield: true,
        bodyLocation: { sp: 7, ablation: 0 },
        headLocation: { sp: 11, ablation: 0 },
        shieldHitPoints: { value: 8, max: 10 },
        penalty: 0,
      },
    });
    expect(chips).toContain("Shield HP 8/10");
    expect(chips.some((c) => c.startsWith("Head SP"))).toBe(false);
    expect(chips.some((c) => c.startsWith("Body SP"))).toBe(false);
  });

  it("renders partial (browser-index) armor data without NaN/undefined", () => {
    // Compendium index entries carry only a thin slice of `system`: the SP/HP
    // maxes and location flags, but NOT the derived ablation / current values.
    const chips = buildItemChips({
      type: "armor",
      system: {
        isBodyLocation: true,
        isHeadLocation: true,
        isShield: true,
        headLocation: { sp: 11 },
        bodyLocation: { sp: 7 },
        shieldHitPoints: { max: 10 },
      },
    });
    const joined = chips.join(" | ");
    expect(joined).not.toContain("NaN");
    expect(joined).not.toContain("undefined");
    // Missing ablation is treated as 0, so current === sp.
    expect(chips).toContain("Head SP 11/11");
    expect(chips).toContain("Body SP 7/7");
    // Missing current HP defaults to the max.
    expect(chips).toContain("Shield HP 10/10");
  });
});

describe("buildItemChips — cyberware", () => {
  const base = () => ({
    type: "cyberware",
    system: {
      isWeapon: false,
      damage: "3d6",
      rof: 2,
      fireModes: { autoFire: 0, suppressiveFire: false },
      attackmod: 0,
      isFoundational: true,
      installLocation: "hospital",
      humanityLoss: { roll: "1d6", static: 3 },
      installedItems: { usedSlots: 1, slots: 3 },
      type: "cyberArm",
      concealable: { concealable: false },
    },
  });

  it("shows Foundational, Install, Slots (used/total) and Humanity Loss", () => {
    const chips = buildItemChips(base());
    expect(chips).toContain("Foundational");
    expect(chips).toContain("Slots 1/3");
    expect(chips.some((c) => c.startsWith("Install "))).toBe(true);
    // Install location value carries the "hospital" location either raw or localized.
    expect(chips.find((c) => c.startsWith("Install "))).toMatch(/hospital/i);
  });

  it("hides attackable chips when the cyberware is not a weapon", () => {
    const chips = buildItemChips(base());
    expect(chips).not.toContain("Damage 3d6");
    expect(chips.some((c) => c.startsWith("ROF"))).toBe(false);
  });

  it("shows attackable chips when the cyberware IS a weapon", () => {
    const src = base();
    src.system.isWeapon = true;
    const chips = buildItemChips(src);
    expect(chips).toContain("Damage 3d6");
    expect(chips).toContain("ROF 2");
  });

  it("shows the humanity-loss roll when present (not the static value)", () => {
    const chips = buildItemChips(base());
    expect(chips).toContain("1d6 HL");
    expect(chips).not.toContain("3 HL");
  });

  it("falls back to the static humanity loss when there is no roll", () => {
    const src = base();
    src.system.humanityLoss = { roll: "", static: 3 };
    const chips = buildItemChips(src);
    expect(chips).toContain("3 HL");
    expect(chips).not.toContain("1d6 HL");
  });

  it("hides the humanity-loss chip entirely when zero", () => {
    const src = base();
    src.system.humanityLoss = { roll: "", static: 0 };
    const chips = buildItemChips(src);
    expect(chips.some((c) => /HL$/.test(c))).toBe(false);
  });

  it("drops the Slots chip when there are no slots", () => {
    const src = base();
    src.system.installedItems = { usedSlots: 0, slots: 0 };
    const chips = buildItemChips(src);
    expect(chips.some((c) => c.startsWith("Slots "))).toBe(false);
  });

  it("drops the Foundational flag when false", () => {
    const src = base();
    src.system.isFoundational = false;
    expect(buildItemChips(src)).not.toContain("Foundational");
  });
});

describe("buildItemChips — ammo", () => {
  const base = () => ({
    type: "ammo",
    system: {
      ablationValue: 2,
      overrides: { damage: { mode: "set", value: "3d6" } },
      type: "basic",
      variety: "heavyPistol",
    },
  });

  it("shows the Ablation chip and the Damage override", () => {
    const chips = buildItemChips(base());
    expect(chips).toContain("Ablation 2");
    expect(chips).toContain("Damage 3d6");
  });

  it("hides Damage when the ammo does not override weapon damage", () => {
    const src = base();
    src.system.overrides.damage.mode = "none";
    const chips = buildItemChips(src);
    expect(chips.some((c) => c.startsWith("Damage"))).toBe(false);
    expect(chips).toContain("Ablation 2");
  });
});

describe("buildItemChips — program", () => {
  const normal = () => ({
    type: "program",
    system: {
      class: "defender",
      blackIceType: "antipersonnel",
      atk: 6,
      def: 6,
      rez: { value: 10, max: 10 },
      per: 4,
      spd: 3,
      damage: { standard: "1d6", blackIce: "2d6" },
    },
  });

  it("shows ATK/DEF/REZ for a normal program and hides Black-ICE-only stats", () => {
    const chips = buildItemChips(normal());
    expect(chips).toContain("ATK 6");
    expect(chips).toContain("DEF 6");
    expect(chips).toContain("REZ 10");
    expectOrder(chips, "ATK 6", "DEF 6");
    expectOrder(chips, "DEF 6", "REZ 10");
    expect(chips.some((c) => c.startsWith("PER"))).toBe(false);
    expect(chips.some((c) => c.startsWith("SPD"))).toBe(false);
    expect(chips.some((c) => c.startsWith("Damage"))).toBe(false);
  });

  it("adds PER, SPD and Black ICE damage for a Black ICE program", () => {
    const src = normal();
    src.system.class = "blackice";
    src.system.atk = 8;
    src.system.def = 8;
    src.system.rez = { value: 15, max: 15 };
    const chips = buildItemChips(src);
    expect(chips).toContain("ATK 8");
    expect(chips).toContain("DEF 8");
    expect(chips).toContain("REZ 15");
    expect(chips).toContain("PER 4");
    expect(chips).toContain("SPD 3");
    expect(chips).toContain("Damage 2d6");
  });

  it("always shows ATK/DEF/REZ even when they are zero", () => {
    const chips = buildItemChips({
      type: "program",
      system: {
        class: "defender",
        blackIceType: "antipersonnel",
        atk: 0,
        def: 0,
        rez: { value: 0, max: 0 },
        per: 4,
        spd: 3,
        damage: { standard: "1d6", blackIce: "2d6" },
      },
    });
    expect(chips).toContain("ATK 0");
    expect(chips).toContain("DEF 0");
    expect(chips).toContain("REZ 0");
  });
});

describe("buildItemChips — other representative types", () => {
  it("skill shows Level and Stat", () => {
    const chips = buildItemChips({
      type: "skill",
      system: { level: 5, stat: "int", category: "awarenessSkills" },
    });
    expect(chips).toContain("Level 5");
    const stat = chips.find((c) => c.startsWith("Stat "));
    expect(stat).toBeTruthy();
    expect(stat).toMatch(/int/i);
  });

  it("role shows Rank", () => {
    const chips = buildItemChips({ type: "role", system: { rank: 4 } });
    expect(chips).toContain("Rank 4");
  });

  it("vehicle shows Seats, SDP and Combat Speed in order", () => {
    const chips = buildItemChips({
      type: "vehicle",
      system: { seats: 4, sdp: 50, speedCombat: 20 },
    });
    expect(chips).toContain("Seats 4");
    expect(chips).toContain("SDP 50");
    expect(chips).toContain("Combat Speed 20");
    expectOrder(chips, "Seats 4", "SDP 50");
    expectOrder(chips, "SDP 50", "Combat Speed 20");
  });

  it("netarch shows the floor count", () => {
    const chips = buildItemChips({
      type: "netarch",
      system: { floors: [{}, {}, {}] },
    });
    expect(chips).toContain("Floors 3");
  });

  it("criticalInjury shows Death Save Increase, Quick Fix DV and Treatment DV", () => {
    const chips = buildItemChips({
      type: "criticalInjury",
      system: {
        deathSaveIncrease: true,
        quickFix: { dvFirstAid: 13, dvParamedic: 13 },
        treatment: { dvParamedic: 15, dvSurgery: 15 },
      },
    });
    expect(chips).toContain("Death Save Increase");
    expect(chips).toContain("Quick Fix DV 13");
    expect(chips).toContain("Treatment DV 15");
  });

  it("criticalInjury drops the Death Save Increase flag when false", () => {
    const chips = buildItemChips({
      type: "criticalInjury",
      system: {
        deathSaveIncrease: false,
        quickFix: { dvFirstAid: 13, dvParamedic: 13 },
        treatment: { dvParamedic: 15, dvSurgery: 15 },
      },
    });
    expect(chips).not.toContain("Death Save Increase");
  });
});

describe("buildItemChips — electronic mixin flags", () => {
  const gear = (overrides = {}) => ({
    type: "gear",
    system: {
      isElectronic: true,
      providesHardening: true,
      concealable: { concealable: false },
      installedItems: { usedSlots: 0, slots: 0 },
      ...overrides,
    },
  });

  it("shows Electronic and Providing Hardening when both true", () => {
    const chips = buildItemChips(gear());
    expect(chips).toContain("Electronic");
    expect(chips).toContain("Providing Hardening");
    expectOrder(chips, "Electronic", "Providing Hardening");
  });

  it("drops Providing Hardening when false", () => {
    const chips = buildItemChips(gear({ providesHardening: false }));
    expect(chips).toContain("Electronic");
    expect(chips).not.toContain("Providing Hardening");
  });

  it("drops Electronic when false", () => {
    const chips = buildItemChips(gear({ isElectronic: false }));
    expect(chips).not.toContain("Electronic");
  });
});

describe("buildItemBreadcrumb — type segment and structure", () => {
  it("weapon: [Type, weaponType, Quality, Brand] with includeType true", () => {
    const src = {
      type: "weapon",
      system: {
        weaponType: "heavyPistol",
        quality: "excellent",
        brand: "Militech",
      },
    };
    expect(buildItemBreadcrumb(src, { includeType: true })).toEqual([
      "CPR.global.itemTypes.weapon",
      "CPR.global.weaponType.heavyPistol",
      "CPR.global.itemQuality.excellent",
      "Militech",
    ]);
  });

  it("weapon: drops the leading Type segment when includeType false", () => {
    const src = {
      type: "weapon",
      system: {
        weaponType: "heavyPistol",
        quality: "excellent",
        brand: "Militech",
      },
    };
    expect(buildItemBreadcrumb(src, { includeType: false })).toEqual([
      "CPR.global.weaponType.heavyPistol",
      "CPR.global.itemQuality.excellent",
      "Militech",
    ]);
  });

  it("defaults includeType to true", () => {
    const crumb = buildItemBreadcrumb({
      type: "weapon",
      system: { weaponType: "heavyPistol", quality: "standard", brand: "" },
    });
    expect(crumb[0]).toBe("CPR.global.itemTypes.weapon");
  });

  it("omits the Quality segment for Standard quality", () => {
    const crumb = buildItemBreadcrumb(
      {
        type: "weapon",
        system: { weaponType: "heavyPistol", quality: "standard", brand: "" },
      },
      { includeType: false },
    );
    expect(crumb).toEqual(["CPR.global.weaponType.heavyPistol"]);
  });

  it("shows a Poor quality segment", () => {
    const crumb = buildItemBreadcrumb(
      {
        type: "weapon",
        system: { weaponType: "heavyPistol", quality: "poor", brand: "" },
      },
      { includeType: false },
    );
    expect(crumb).toEqual([
      "CPR.global.weaponType.heavyPistol",
      "CPR.global.itemQuality.poor",
    ]);
  });
});

describe("buildItemBreadcrumb — per-type subtypes", () => {
  it("ammo has two subtype segments (type then variety) and no quality", () => {
    const src = {
      type: "ammo",
      system: { type: "basic", variety: "heavyPistol", brand: "" },
    };
    expect(buildItemBreadcrumb(src, { includeType: true })).toEqual([
      "CPR.global.itemTypes.ammo",
      "CPR.global.ammo.type.basic",
      "CPR.global.ammo.variety.heavyPistol",
    ]);
    expect(buildItemBreadcrumb(src, { includeType: false })).toEqual([
      "CPR.global.ammo.type.basic",
      "CPR.global.ammo.variety.heavyPistol",
    ]);
  });

  it("program (normal) shows only the class subtype", () => {
    const crumb = buildItemBreadcrumb(
      {
        type: "program",
        system: { class: "defender", blackIceType: "antipersonnel" },
      },
      { includeType: false },
    );
    expect(crumb).toEqual(["CPR.global.programClass.defender"]);
  });

  it("program (Black ICE) adds a Black ICE type segment after the class", () => {
    const crumb = buildItemBreadcrumb(
      {
        type: "program",
        system: { class: "blackice", blackIceType: "antipersonnel" },
      },
      { includeType: false },
    );
    expect(crumb).toEqual([
      "CPR.global.programClass.blackice",
      "CPR.global.blackIce.type.antiPersonnel",
    ]);
  });

  it("cyberware shows its cyberware type then the brand", () => {
    const crumb = buildItemBreadcrumb(
      { type: "cyberware", system: { type: "cyberArm", brand: "Kiroshi" } },
      { includeType: true },
    );
    expect(crumb).toEqual([
      "CPR.global.itemTypes.cyberware",
      "CPR.global.cyberwareType.cyberArm",
      "Kiroshi",
    ]);
  });

  it("criticalInjury shows its location", () => {
    const crumb = buildItemBreadcrumb(
      { type: "criticalInjury", system: { location: "head" } },
      { includeType: true },
    );
    expect(crumb).toEqual([
      "CPR.global.itemTypes.criticalInjury",
      "CPR.global.location.head",
    ]);
  });

  it("criticalInjury omits the location segment when unset", () => {
    const crumb = buildItemBreadcrumb(
      { type: "criticalInjury", system: {} },
      { includeType: false },
    );
    expect(crumb).toEqual([]);
  });

  it("skill shows its category and nothing else", () => {
    const crumb = buildItemBreadcrumb(
      { type: "skill", system: { category: "awarenessSkills" } },
      { includeType: false },
    );
    expect(crumb).toEqual(["CPR.global.skillCategories.awarenessSkills"]);
  });

  it("clothing shows type then style then brand", () => {
    const crumb = buildItemBreadcrumb(
      {
        type: "clothing",
        system: { type: "jacket", style: "genericChic", brand: "Militech" },
      },
      { includeType: false },
    );
    expect(crumb).toEqual([
      "CPR.global.clothing.type.jacket",
      "CPR.global.clothing.style.genericChic",
      "Militech",
    ]);
  });

  it("cyberdeck shows quality and brand but no distinct subtype", () => {
    const crumb = buildItemBreadcrumb(
      { type: "cyberdeck", system: { quality: "poor", brand: "Arasaka" } },
      { includeType: true },
    );
    expect(crumb).toEqual([
      "CPR.global.itemTypes.cyberdeck",
      "CPR.global.itemQuality.poor",
      "Arasaka",
    ]);
  });

  it("role has no subtype, quality or brand", () => {
    expect(
      buildItemBreadcrumb({ type: "role", system: {} }, { includeType: true }),
    ).toEqual(["CPR.global.itemTypes.role"]);
    expect(
      buildItemBreadcrumb({ type: "role", system: {} }, { includeType: false }),
    ).toEqual([]);
  });

  it("vehicle carries only a brand segment", () => {
    const crumb = buildItemBreadcrumb(
      { type: "vehicle", system: { brand: "Yaiba" } },
      { includeType: false },
    );
    expect(crumb).toEqual(["Yaiba"]);
  });

  it("netarch has no subtype, quality or brand", () => {
    expect(
      buildItemBreadcrumb(
        { type: "netarch", system: {} },
        { includeType: false },
      ),
    ).toEqual([]);
  });
});

describe("buildItemBreadcrumb — armor covered locations", () => {
  it("joins multiple covered locations with ' & ' and puts brand last", () => {
    const crumb = buildItemBreadcrumb(
      {
        type: "armor",
        system: {
          isBodyLocation: true,
          isHeadLocation: true,
          isShield: false,
          brand: "Militech",
        },
      },
      { includeType: true },
    );
    expect(crumb[0]).toBe("CPR.global.itemTypes.armor");
    expect(crumb[crumb.length - 1]).toBe("Militech");
    // The covered-location segment fuses Body & Head into one " & "-joined string.
    expect(crumb.some((s) => s.includes(" & "))).toBe(true);
  });

  it("uses a single, un-joined segment for a single covered location", () => {
    const crumb = buildItemBreadcrumb(
      {
        type: "armor",
        system: {
          isBodyLocation: true,
          isHeadLocation: false,
          isShield: false,
          brand: "",
        },
      },
      { includeType: false },
    );
    expect(crumb.some((s) => s.includes(" & "))).toBe(false);
    expect(crumb.length).toBe(1);
  });
});
