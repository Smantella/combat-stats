/**
 * ChartsApp v1.5.4
 * - Close tab X fixed
 * - Player colours from game.users
 * - Chart.js loaded from CDN
 */

import { exportToExcel } from "./exporter.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const MODULE_ID   = "combat-stats";
const S_HISTORY   = "combatHistory";
const CHARTJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js";

let _chartJsReady = false;
async function ensureChartJs() {
  if (_chartJsReady || globalThis.Chart) { _chartJsReady = true; return; }
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CHARTJS_CDN;
    s.onload  = () => { _chartJsReady = true; resolve(); };
    s.onerror = () => reject(new Error("Chart.js CDN load failed"));
    document.head.appendChild(s);
  });
}

/** Build actorId → player hex colour map from game.users */
function buildPlayerColourMap() {
  const map = {};
  for (const user of game.users ?? []) {
    const actor = user.character; // the user's assigned PC
    if (actor) map[actor.id] = user.color?.css ?? user.color ?? null;
    // also map by name as fallback
    if (actor) map[actor.name] = user.color?.css ?? user.color ?? null;
  }
  return map;
}

export class ChartsApp extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor() {
    super();
    this._chart     = null;
    this._metric    = "dealt";
    this._chartType = "bar";
    this._tab       = "totals";
    this._fightId   = null;
  }

  static DEFAULT_OPTIONS = {
    id: "combat-stats-charts",
    classes: ["combat-stats", "charts"],
    window: { title: "Combat Stats", resizable: true, draggable: true },
    position: { width: 800, height: 600 }
  };

  static PARTS = {
    body: { template: "modules/combat-stats/templates/charts.hbs" }
  };

  // ── Context ────────────────────────────────────────────────────────────────

  async _prepareContext() {
    const history = game.settings.get(MODULE_ID, S_HISTORY) ?? [];

    const totalsMap = {};
    for (const fight of history) {
      for (const [id, c] of Object.entries(fight.characters ?? {})) {
        if (!totalsMap[id]) totalsMap[id] = { name: c.name, damageDealt: 0, damageTaken: 0, healingDone: 0, kills: 0 };
        totalsMap[id].damageDealt += c.damageDealt ?? 0;
        totalsMap[id].damageTaken += c.damageTaken ?? 0;
        totalsMap[id].healingDone += c.healingDone ?? 0;
        totalsMap[id].kills       += c.kills       ?? 0;
        totalsMap[id].name         = c.name;
      }
    }
    const totals = Object.values(totalsMap).sort((a, b) => b.damageDealt - a.damageDealt);
    const grandTotal = totals.reduce(
      (a, c) => { a.damageDealt += c.damageDealt; a.damageTaken += c.damageTaken; a.healingDone += c.healingDone; a.kills += c.kills; return a; },
      { damageDealt: 0, damageTaken: 0, healingDone: 0, kills: 0 }
    );

    let selectedFight = null, fightChars = [], fightDefeated = [];
    let fightTotal = { damageDealt: 0, damageTaken: 0, healingDone: 0, kills: 0 };
    if (this._fightId) {
      selectedFight = history.find(f => f.id === this._fightId);
      if (selectedFight) {
        fightChars = Object.values(selectedFight.characters ?? {}).sort((a, b) => b.damageDealt - a.damageDealt);
        fightTotal = fightChars.reduce(
          (a, c) => { a.damageDealt += c.damageDealt ?? 0; a.damageTaken += c.damageTaken ?? 0; a.healingDone += c.healingDone ?? 0; a.kills += c.kills ?? 0; return a; },
          { damageDealt: 0, damageTaken: 0, healingDone: 0, kills: 0 }
        );
        fightDefeated = (selectedFight.defeated ?? []).map(d => ({
          name:       d.name,
          killerName: d.killedBy ? (game.actors.get(d.killedBy)?.name ?? "Unknown") : null
        }));
      }
    }

    return {
      history, hasData: history.length > 0,
      tab: this._tab, metric: this._metric, chartType: this._chartType, isGM: game.user.isGM,
      totals, grandTotal,
      selectedFight, fightChars, fightTotal, fightDefeated,
      date: selectedFight ? new Date(selectedFight.date).toLocaleString() : ""
    };
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  _onRender(context, options) {
    const html = this.element;

    // Tab buttons
    html.querySelectorAll(".cs-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this._tab = btn.dataset.tab;
        this.render(true);
      });
    });

    // Close fight tab — standalone element outside the button, no bubbling issues
    html.querySelector("#cs-close-fight-tab")?.addEventListener("click", () => {
      this._fightId = null;
      this._tab     = "totals";
      this.render(true);
    });

    html.querySelectorAll(".cs-mode-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this._metric = btn.dataset.mode;
        html.querySelectorAll(".cs-mode-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this._buildChart(html);
      });
    });

    html.querySelectorAll(".cs-type-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this._chartType = btn.dataset.type;
        html.querySelectorAll(".cs-type-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this._buildChart(html);
      });
    });

    html.querySelector("#cs-fight-select")?.addEventListener("change", (ev) => {
      this._fightId = ev.target.value || null;
      this._tab     = this._fightId ? "fight" : "totals";
      this.render(true);
    });

    html.querySelector("#cs-delete-fight")?.addEventListener("click", async () => {
      if (!this._fightId) return;
      const history = game.settings.get(MODULE_ID, S_HISTORY) ?? [];
      const fight   = history.find(f => f.id === this._fightId);
      if (!fight) return;
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window:  { title: "Delete Fight" },
        content: `<p>Delete <strong>${fight.name}</strong>? This action is irreversible.</p>`
      });
      if (!confirmed) return;
      await game.settings.set(MODULE_ID, S_HISTORY, history.filter(f => f.id !== this._fightId));
      this._fightId = null; this._tab = "totals";
      this.render(true);
    });

    html.querySelector("#cs-export-excel")?.addEventListener("click", () => {
      exportToExcel(game.settings.get(MODULE_ID, S_HISTORY) ?? [], "combat-stats");
    });

    html.querySelector("#cs-clear-history")?.addEventListener("click", async () => {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window:  { title: "Clear History" },
        content: "<p>Delete <strong>all</strong> history? This action is irreversible.</p>"
      });
      if (confirmed) {
        await game.settings.set(MODULE_ID, S_HISTORY, []);
        this._fightId = null; this._tab = "totals";
        this.render(true);
      }
    });

    if (this._tab === "history") this._buildChart(html);
  }

  // ── Chart ──────────────────────────────────────────────────────────────────

  async _buildChart(html) {
    const canvas = html.querySelector("#cs-chart-canvas");
    if (!canvas) return;
    const history = game.settings.get(MODULE_ID, S_HISTORY) ?? [];
    if (!history.length) return;

    try { await ensureChartJs(); } catch(e) {
      const c = html.querySelector(".cs-chart-container");
      if (c) c.innerHTML = `<p class="cs-no-data">Chart.js not available.<br>Check your internet connection.</p>`;
      return;
    }

    if (this._chart) { this._chart.destroy(); this._chart = null; }

    const actorNames = new Set();
    history.forEach(f => Object.values(f.characters).forEach(c => actorNames.add(c.name)));
    const actors = [...actorNames];
    const labels = history.map(f => f.name);
    const field  = { dealt: "damageDealt", taken: "damageTaken", healed: "healingDone", kills: "kills" }[this._metric] ?? "damageDealt";

    // Use player colours from User configuration, fallback to palette
    const colourMap  = buildPlayerColourMap();
    const fallback   = ["#ce4141","#e67e22","#2ecc71","#52a8e0","#e0c852","#a352e0","#e07f52","#52e0d1"];
    const textColor  = getComputedStyle(document.documentElement).getPropertyValue("--cs-text").trim() || "#eee";

    const datasets = actors.map((name, i) => {
      const colour = colourMap[name] ?? fallback[i % fallback.length];
      return {
        label: name,
        data:  history.map(fight => {
          const e = Object.values(fight.characters).find(c => c.name === name);
          return e ? (e[field] ?? 0) : 0;
        }),
        backgroundColor: colour + "99",
        borderColor:     colour,
        borderWidth: 2, tension: 0.3
      };
    });

    this._chart = new Chart(canvas.getContext("2d"), {
      type: this._chartType,
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: textColor } },
          tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y}` } }
        },
        scales: {
          x: { ticks: { color: textColor }, grid: { color: "#44444488" } },
          y: { beginAtZero: true, ticks: { color: textColor }, grid: { color: "#44444488" } }
        }
      }
    });
  }
}
