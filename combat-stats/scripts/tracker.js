/**
 * CombatTracker v1.5.0
 * Hybrid: RollComplete (midi) or postUseActivity (native) → attacker cache
 * dnd5e.damageActor / healActor → defender + actual HP lost
 *
 * NEW: dialog to name the fight on createCombat
 */

import { SummaryApp } from "./summary.js";

const MODULE_ID = "combat-stats";
const S_HISTORY = "combatHistory";
const S_CURRENT = "currentCombatData";
const TTL_MS    = 30_000;

export class CombatTracker {

  constructor(mode = "native") {
    this._mode = mode;
    this._recentAttackers = [];
    this._recentHealers   = [];
  }

  init() {
    // ── Combat created: just ask for a name ────────────────────────────────
    Hooks.on("createCombat", async (combat) => {
      if (!game.user.isGM) return;

      const fightNumber = (game.settings.get(MODULE_ID, S_HISTORY)?.length ?? 0) + 1;
      const defaultName = `Fight #${fightNumber}`;
      const name        = await this._promptFightName(defaultName);

      this._resetCurrent(combat.id, name);
      console.log(`Combat Stats | Combat started: "${name}" [${combat.id}] mode=${this._mode}`);
    });

    // ── Combat end: save ───────────────────────────────────────────────────
    Hooks.on("deleteCombat", async (combat) => {
      if (!game.user.isGM) return;
      const current = game.settings.get(MODULE_ID, S_CURRENT);
      if (!current?.combatId || current.combatId !== combat.id) return;
      await this._finaliseAndSave(combat, current.fightName);
    });

    this._initDamageHooks();

    if (this._mode === "midi") this._initMidiSource();
    else                       this._initNativeSource();
  }

  // ── Fight name dialog — returns the chosen name string ────────────────────
  _promptFightName(defaultName) {
    return new Promise((resolve) => {
      new Dialog({
        title: "⚔️ Combat Stats — Fight Name",
        content: `
          <div style="padding:8px 4px;">
            <label style="display:block;margin-bottom:6px;font-weight:600;color:var(--cs-accent,#d4af37);">
              Fight name:
            </label>
            <input id="cs-fight-name" type="text" value="${defaultName}"
              style="width:100%;padding:5px 8px;background:#111827;color:#eee;
                     border:1px solid var(--cs-accent,#d4af37);border-radius:4px;
                     font-family:inherit;font-size:1em;"
              autofocus>
          </div>`,
        buttons: {
          ok: {
            icon:  '<i class="fa-solid fa-swords"></i>',
            label: "Confirm",
            callback: (html) => {
              const val = html.find("#cs-fight-name").val()?.trim();
              resolve(val || defaultName);
            }
          }
        },
        default: "ok",
        close:   () => resolve(defaultName)
      }, { classes: ["dialog", "combat-stats-dialog"], width: 360 }).render(true);
    });
  }

  // ── Damage hooks (shared) ───────────────────────────────────────────────

  _initDamageHooks() {
    // Track recently killed token IDs to prevent double-counting
    // (some hooks fire twice per hit)
    this._recentlyKilled = new Set();

    Hooks.on("dnd5e.damageActor", (actor, damages, options) => {
      if (!game.user.isGM || !game.combat?.active) return;
      const current = game.settings.get(MODULE_ID, S_CURRENT);
      if (!current?.combatId) return;

      const total = this._extractTotal(damages);
      if (total <= 0) return;

      const defenderIsPC  = actor.type === "character";
      const attacker      = this._popRecent(this._recentAttackers);
      const attackerIsPC  = attacker && game.actors.get(attacker.actorId)?.type === "character";

      // Damage taken — PC only
      if (defenderIsPC)
        this._acc(current, actor.id, actor.name, "damageTaken", total);

      // Damage dealt — PC attacker only
      if (attacker && attacker.actorId !== actor.id && attackerIsPC)
        this._acc(current, attacker.actorId, attacker.actorName, "damageDealt", total);

      game.settings.set(MODULE_ID, S_CURRENT, current);
      console.log(`Combat Stats | ${actor.name} took ${total}${attacker ? ` from ${attacker.actorName}` : ""}`);
    });

    // ── Kill detection via updateActor ─────────────────────────────────
    // updateActor fires ONCE after HP are committed to the document.
    // We compare previous HP (diff) to new HP to detect a death.
    // We use a Set of tokenIds to prevent double-counting within 500ms.
    Hooks.on("updateActor", (actor, changes, options, userId) => {
      if (!game.user.isGM || !game.combat?.active) return;
      if (actor.type !== "npc") return;
      const current = game.settings.get(MODULE_ID, S_CURRENT);
      if (!current?.combatId) return;

      const newHP = changes?.system?.attributes?.hp?.value;
      if (newHP === undefined || newHP > 0) return; // only care about → 0

      // Deduplicate: ignore if we already registered this kill recently
      const killKey = `${actor.id}-${Date.now() - (Date.now() % 500)}`; // 500ms bucket
      if (this._recentlyKilled.has(killKey)) return;
      this._recentlyKilled.add(killKey);
      setTimeout(() => this._recentlyKilled.delete(killKey), 600);

      // Find the PC attacker who hit most recently
      const attacker     = this._popRecent(this._recentAttackers);
      const attackerIsPC = attacker && game.actors.get(attacker.actorId)?.type === "character";

      if (attacker && attackerIsPC)
        this._accKill(current, attacker.actorId, attacker.actorName, actor.name);

      if (!current.defeated) current.defeated = [];
      current.defeated.push({
        name:     actor.name,
        id:       actor.id,
        killedBy: (attacker && attackerIsPC) ? attacker.actorId : null
      });

      game.settings.set(MODULE_ID, S_CURRENT, current);
      console.log(`Combat Stats | ${actor.name} defeated${attacker ? ` by ${attacker.actorName}` : ""}`);
    });

    Hooks.on("dnd5e.healActor", (actor, amount, options) => {
      if (!game.user.isGM || !game.combat?.active) return;
      const current = game.settings.get(MODULE_ID, S_CURRENT);
      if (!current?.combatId) return;

      const total = this._extractTotal(amount);
      if (total <= 0) return;

      const healer       = this._popRecent(this._recentHealers);
      const healerIsPC   = healer && game.actors.get(healer.actorId)?.type === "character";

      if (healer && healerIsPC) {
        this._acc(current, healer.actorId, healer.actorName, "healingDone", total);
        console.log(`Combat Stats | ${healer.actorName} healed ${total}`);
      }
      game.settings.set(MODULE_ID, S_CURRENT, current);
    });
  }

  // ── Source: MidiQOL ─────────────────────────────────────────────────────

  _initMidiSource() {
    console.log("Combat Stats | Source: MidiQOL");
    Hooks.on("midi-qol.RollComplete", (wf) => {
      if (!game.combat?.active) return;
      const actor = wf.actor;
      if (!actor) return;
      const isHeal = this._midiIsHeal(wf);
      const entry  = { actorId: actor.id, actorName: actor.name, ts: Date.now() };
      if (isHeal) this._recentHealers.push(entry);
      else if ((wf.damageTotal ?? 0) > 0 || wf.damageRoll) this._recentAttackers.push(entry);
      this._cleanStale();
    });
  }

  // ── Source: Native dnd5e ────────────────────────────────────────────────

  _initNativeSource() {
    console.log("Combat Stats | Source: native dnd5e");
    Hooks.on("dnd5e.postUseActivity", (activity, usageConfig, results) => {
      if (!game.combat?.active) return;
      const actor = activity?.actor;
      if (!actor) return;
      const isHeal = this._activityIsHeal(activity);
      const entry  = { actorId: actor.id, actorName: actor.name, ts: Date.now() };
      if (isHeal) this._recentHealers.push(entry);
      else        this._recentAttackers.push(entry);
      this._cleanStale();
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  _popRecent(list) {
    const now = Date.now();
    for (let i = list.length - 1; i >= 0; i--)
      if (now - list[i].ts <= TTL_MS) return list[i];
    return null;
  }

  _cleanStale() {
    const cut = Date.now() - TTL_MS;
    this._recentAttackers = this._recentAttackers.filter(e => e.ts > cut);
    this._recentHealers   = this._recentHealers.filter(e => e.ts > cut);
  }

  _extractTotal(damages) {
    if (damages == null) return 0;
    if (typeof damages === "number") return Math.abs(damages);
    if (typeof damages.total === "number") return Math.abs(damages.total);
    if (Array.isArray(damages))
      return damages.reduce((s, d) => s + Math.abs(+(d?.value ?? d?.total ?? d?.damage ?? 0)), 0);
    if (typeof damages[Symbol.iterator] === "function") {
      let s = 0; for (const d of damages) s += Math.abs(+(d?.value ?? 0)); return s;
    }
    return 0;
  }

  _midiIsHeal(wf) {
    if (wf.item?.system?.actionType === "heal") return true;
    return ["healing","temphp"].includes((wf.damageDetail?.[0]?.type ?? "").toLowerCase());
  }

  _activityIsHeal(activity) {
    if (activity?.type === "heal") return true;
    if (activity?.item?.system?.actionType === "heal") return true;
    for (const p of (activity?.damage?.parts ?? activity?.item?.system?.damage?.parts ?? [])) {
      const t = (p?.types?.[0] ?? p?.[1] ?? "").toLowerCase();
      if (t === "healing" || t === "temphp") return true;
    }
    return false;
  }

  _acc(current, actorId, actorName, field, amount) {
    if (!current.characters) current.characters = {};
    if (!current.characters[actorId])
      current.characters[actorId] = { id: actorId, name: actorName, damageDealt: 0, damageTaken: 0, healingDone: 0, kills: 0 };
    current.characters[actorId][field]  += amount;
    current.characters[actorId].name     = actorName;
    current.characters[actorId].id       = actorId;
    if (current.characters[actorId].kills === undefined) current.characters[actorId].kills = 0;
  }

  _accKill(current, actorId, actorName, victimName) {
    if (!current.characters) current.characters = {};
    if (!current.characters[actorId])
      current.characters[actorId] = { id: actorId, name: actorName, damageDealt: 0, damageTaken: 0, healingDone: 0, kills: 0 };
    current.characters[actorId].kills = (current.characters[actorId].kills ?? 0) + 1;
    current.characters[actorId].name  = actorName;
    current.characters[actorId].id    = actorId;
    console.log(`Combat Stats | ${actorName} defeated ${victimName}`);
  }

  _resetCurrent(combatId, fightName) {
    game.settings.set(MODULE_ID, S_CURRENT, { combatId, fightName, characters: {}, defeated: [] });
  }

  async _finaliseAndSave(combat, fightName) {
    const current = game.settings.get(MODULE_ID, S_CURRENT);
    const history = game.settings.get(MODULE_ID, S_HISTORY) ?? [];
    const record  = {
      id:         crypto.randomUUID(),
      date:       new Date().toISOString(),
      name:       fightName || combat.name || `Fight #${history.length + 1}`,
      characters: current.characters ?? {},
      defeated:   current.defeated   ?? []   // array of { name, id, killedBy }
    };
    history.push(record);
    await game.settings.set(MODULE_ID, S_HISTORY, history);
    await game.settings.set(MODULE_ID, S_CURRENT, {});
    console.log(`Combat Stats | Saved: ${record.name} (${record.defeated.length} enemies defeated)`);
    SummaryApp.openOnce(record);
  }
}
