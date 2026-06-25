/**
 * Combat Stats v1.5.7 — by Emil
 * Foundry VTT v13 / D&D 5e
 */

import { CombatTracker }       from "./tracker.js";
import { ChartsApp }           from "./charts.js";
import { CombatStatsSettings } from "./settings-menu.js";

export const MODULE_ID       = "combat-stats";
export const SETTING_HISTORY = "combatHistory";
export const SETTING_CURRENT = "currentCombatData";
export const SETTING_TRACKER = "trackerMode";

export const COLOR_DEFAULTS = {
  accent:  "#d4af37",
  bg:      "#1a1a24",
  bgRow:   "#252530",
  dealt:   "#ce4141",
  taken:   "#e67e22",
  healed:  "#2ecc71",
  text:    "#eeeeee",
};

// ─── Init ──────────────────────────────────────────────────────────────────────
Hooks.once("init", () => {
  console.log("Combat Stats | v1.5.7 by Emil — init");

  game.settings.register(MODULE_ID, SETTING_HISTORY, {
    scope: "world", config: false, type: Array, default: [], name: "History"
  });
  game.settings.register(MODULE_ID, SETTING_CURRENT, {
    scope: "world", config: false, type: Object, default: {}, name: "Current"
  });

  const hidden = { scope: "world", config: false };
  game.settings.register(MODULE_ID, "playersCanViewCharts", {
    ...hidden, type: Boolean, default: false, name: "Players charts"
  });
  game.settings.register(MODULE_ID, SETTING_TRACKER, {
    ...hidden, type: String, default: "native", name: "Tracker mode",
    onChange: () => {
      if (game.user?.isGM)
        ui.notifications.warn("Combat Stats | Reload Foundry (F5) to apply.", { permanent: true });
    }
  });

  const colorKeys = [
    { key: "colorAccent", def: COLOR_DEFAULTS.accent },
    { key: "colorBg",     def: COLOR_DEFAULTS.bg     },
    { key: "colorBgRow",  def: COLOR_DEFAULTS.bgRow  },
    { key: "colorDealt",  def: COLOR_DEFAULTS.dealt  },
    { key: "colorTaken",  def: COLOR_DEFAULTS.taken  },
    { key: "colorHealed", def: COLOR_DEFAULTS.healed },
    { key: "colorText",   def: COLOR_DEFAULTS.text   },
  ];
  for (const { key, def } of colorKeys) {
    game.settings.register(MODULE_ID, key, {
      ...hidden, type: String, default: def, onChange: () => applyTheme()
    });
  }

  game.settings.registerMenu(MODULE_ID, "openSettings", {
    name:  "Combat Stats Settings",
    label: "Configure",
    hint:  "Tracker mode, theme colours, permissions, data management.",
    icon:  "fa-solid fa-sliders",
    type:  CombatStatsSettings,
    restricted: true
  });
});

// ─── Ready ─────────────────────────────────────────────────────────────────────
Hooks.once("ready", () => {
  const mode = game.settings.get(MODULE_ID, SETTING_TRACKER);
  game.combatStats = new CombatTracker(mode);
  game.combatStats.init();
  applyTheme();

  globalThis.CombatStats = {
    debug:   () => console.table(Object.values(game.settings.get(MODULE_ID, SETTING_CURRENT)?.characters ?? {})),
    history: () => console.log(game.settings.get(MODULE_ID, SETTING_HISTORY)),
    clear:   async () => { await game.settings.set(MODULE_ID, SETTING_HISTORY, []); console.log("cleared"); }
  };
  console.log("Combat Stats | Ready");
});

// ─── CSS theme ─────────────────────────────────────────────────────────────────
export function applyTheme() {
  const g    = k => game.settings.get(MODULE_ID, k);
  const root = document.documentElement;
  root.style.setProperty("--cs-accent",  g("colorAccent"));
  root.style.setProperty("--cs-bg",      g("colorBg"));
  root.style.setProperty("--cs-bg-row",  g("colorBgRow"));
  root.style.setProperty("--cs-dealt",   g("colorDealt"));
  root.style.setProperty("--cs-taken",   g("colorTaken"));
  root.style.setProperty("--cs-healed",  g("colorHealed"));
  root.style.setProperty("--cs-text",    g("colorText"));
}

// ─── Toolbar button via getSceneControlButtons ─────────────────────────────────
Hooks.on("getSceneControlButtons", (controls) => {
  const canView = game.user?.isGM || game.settings.get(MODULE_ID, "playersCanViewCharts");
  if (!canView) return;

  const entries    = Object.entries(controls);
  const anchorKeys = ["sequencer", "specials", "fxmaster", "token-fxtools"];
  let   anchorIdx  = entries.findIndex(([k]) => anchorKeys.includes(k));
  if (anchorIdx === -1) anchorIdx = entries.length - 1;

  const ourEntry = ["combat-stats", {
    name:    "combat-stats",
    title:   "Combat Stats",
    icon:    "fa-solid fa-chart-column",
    visible: true,
    tools: {
      "open-charts": {
        name:    "open-charts",
        title:   "Open Combat Stats",
        icon:    "fa-solid fa-chart-column",
        button:  true,
        onClick: () => {
          const existing = Object.values(ui.windows ?? {}).find(w => w.constructor?.name === "ChartsApp");
          if (existing) existing.bringToFront?.() ?? existing.bringToTop?.();
          else new ChartsApp().render(true);
        }
      }
    }
  }];

  const before    = entries.slice(0, anchorIdx + 1);
  const after     = entries.slice(anchorIdx + 1);
  const reordered = [...before, ourEntry, ...after];
  for (const k of Object.keys(controls)) delete controls[k];
  for (const [k, v] of reordered) controls[k] = v;
});
