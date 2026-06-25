/**
 * CombatStatsSettings v1.6.4
 * Dark-themed FormApplication with i18n support.
 */

import { exportToExcel } from "./exporter.js";

const MODULE_ID = "combat-stats";
const L = k => game.i18n.localize(`COMBATSTATS.Settings.${k}`);

export class CombatStatsSettings extends FormApplication {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:       "combat-stats-settings",
      title:    game.i18n.localize("COMBATSTATS.Settings.Title"),
      template: "modules/combat-stats/templates/settings.hbs",
      width:    460,
      height:   "auto",
      classes:  ["combat-stats", "cs-settings-window"]
    });
  }

  getData() {
    const g = k => game.settings.get(MODULE_ID, k);
    const history = game.settings.get(MODULE_ID, "combatHistory") ?? [];
    return {
      trackerMode:          g("trackerMode"),
      playersCanViewCharts: g("playersCanViewCharts"),
      colorAccent:          g("colorAccent"),
      colorBg:              g("colorBg"),
      colorBgRow:           g("colorBgRow"),
      colorDealt:           g("colorDealt"),
      colorTaken:           g("colorTaken"),
      colorHealed:          g("colorHealed"),
      colorText:            g("colorText"),
      fightCount:           history.length,
      fights:               history.map(f => ({
        id:   f.id,
        name: f.name,
        date: new Date(f.date).toLocaleDateString("en-GB")
      })).reverse()
    };
  }

  async _updateObject(event, formData) {
    for (const [key, value] of Object.entries(formData)) {
      await game.settings.set(MODULE_ID, key, value);
    }
    const { applyTheme } = await import("./module.js");
    applyTheme();
    ui.notifications.info(L("Saved"));
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Live colour preview
    html.find("input[type=color]").on("input", (ev) => {
      const varMap = {
        colorAccent: "--cs-accent", colorBg: "--cs-bg", colorBgRow: "--cs-bg-row",
        colorDealt:  "--cs-dealt",  colorTaken: "--cs-taken",
        colorHealed: "--cs-healed", colorText:  "--cs-text"
      };
      const v = varMap[ev.currentTarget.name];
      if (v) document.documentElement.style.setProperty(v, ev.currentTarget.value);
    });

    // Reset colours
    html.find("#cs-reset-colors").on("click", async () => {
      const { COLOR_DEFAULTS } = await import("./module.js");
      const map = {
        colorAccent: COLOR_DEFAULTS.accent, colorBg:     COLOR_DEFAULTS.bg,
        colorBgRow:  COLOR_DEFAULTS.bgRow,  colorDealt:  COLOR_DEFAULTS.dealt,
        colorTaken:  COLOR_DEFAULTS.taken,  colorHealed: COLOR_DEFAULTS.healed,
        colorText:   COLOR_DEFAULTS.text
      };
      const varMap = {
        colorAccent: "--cs-accent", colorBg: "--cs-bg", colorBgRow: "--cs-bg-row",
        colorDealt: "--cs-dealt", colorTaken: "--cs-taken",
        colorHealed: "--cs-healed", colorText: "--cs-text"
      };
      for (const [k, v] of Object.entries(map)) {
        html.find(`input[name="${k}"]`).val(v);
        if (varMap[k]) document.documentElement.style.setProperty(varMap[k], v);
      }
    });

    // Delete single fight
    html.find("#cs-delete-single-fight").on("click", async () => {
      const fightId = html.find("#cs-fight-to-delete").val();
      if (!fightId) { ui.notifications.warn(L("SelectFirst")); return; }
      const history = game.settings.get(MODULE_ID, "combatHistory") ?? [];
      const fight   = history.find(f => f.id === fightId);
      if (!fight) return;
      const date = new Date(fight.date).toLocaleDateString("en-GB");
      const confirmed = await Dialog.confirm({
        title:   L("DeleteFightTitle"),
        content: `<p>${L("ConfirmDeleteFight").replace("{name}", fight.name).replace("{date}", date)}</p>`
      });
      if (!confirmed) return;
      await game.settings.set(MODULE_ID, "combatHistory", history.filter(f => f.id !== fightId));
      ui.notifications.info(L("FightDeleted").replace("{name}", fight.name));
      this.render();
    });

    // Export
    html.find("#cs-export-data").on("click", async () => {
      const history = game.settings.get(MODULE_ID, "combatHistory") ?? [];
      await exportToExcel(history, "combat-stats");
    });

    // Clear all
    html.find("#cs-reset-data").on("click", async () => {
      const confirmed = await Dialog.confirm({
        title:   L("DeleteAllTitle"),
        content: L("ConfirmDeleteAll")
      });
      if (!confirmed) return;
      await game.settings.set(MODULE_ID, "combatHistory", []);
      ui.notifications.info(L("HistoryCleared"));
      this.render();
    });
  }
}
