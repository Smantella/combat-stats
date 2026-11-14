/**
 * Pathfinder 1e source for Combat Stats.
 *
 * PF1 has no equivalent of dnd5e.damageActor / dnd5e.healActor, so this source
 * works from HP changes, which every damage path ends in (chat card buttons,
 * token HUD edits, macros, applyDamage):
 *
 *   createChatMessage (PF1 action card) → attacker / healer cache
 *   preUpdateActor  → stash previous HP in the update options
 *   updateActor     → diff old vs new HP → damage taken / dealt, healing, kills
 *
 * Everything runs on the active GM. Chat messages and updateActor fire on every
 * client, so player-originated actions are seen without a socket relay.
 */

const MODULE_ID = "combat-stats";
const S_CURRENT = "currentCombatData";
const OPT_KEY   = "combatStats";

export class Pf1Source {

  /** @param {import("../tracker.js").CombatTracker} tracker */
  constructor(tracker) {
    this.tracker  = tracker;
    /** Last known HP per actor UUID; fallback when update options lack the previous value. */
    this._hpCache = new Map();
  }

  init() {
    console.log("Combat Stats | Source: Pathfinder 1e");
    this._initAttackerSource();
    this._initHpTracking();
    this._initCacheSeeding();
  }

  // ── Attacker / healer attribution from PF1 action cards ───────────────────

  _initAttackerSource() {
    Hooks.on("createChatMessage", (message) => {
      if (!this._isActiveGM() || !game.combat?.active) return;
      const info = this._readActionCard(message);
      if (!info) return;

      const entry = { actorId: info.actor.id, actorName: info.actor.name, ts: Date.now() };
      if (info.isHeal) this.tracker._recentHealers.push(entry);
      else             this.tracker._recentAttackers.push(entry);
      this.tracker._cleanStale();
    });
  }

  /**
   * Returns { actor, isHeal } for a PF1 item/action chat card, or null.
   * Reads both the flag-based metadata (older PF1) and message.system (newer PF1).
   */
  _readActionCard(message) {
    const meta = message.flags?.pf1?.metadata ?? {};
    const sys  = message.system ?? {};

    const itemRef   = meta.item   ?? sys.item?.id   ?? sys.item;
    const actionRef = meta.action ?? sys.action?.id ?? sys.action;
    let item = message.itemSource ?? null;
    if (!item && !itemRef) return null;

    const actor = ChatMessage.getSpeakerActor(message.speaker) ?? item?.actor;
    if (!actor) return null;

    if (!item && typeof itemRef === "string") item = actor.items.get(itemRef) ?? null;
    const action = (typeof actionRef === "string" ? item?.actions?.get?.(actionRef) : null)
                ?? item?.defaultAction ?? item?.firstAction ?? null;

    // Ignore utility uses (buffs, consumables without damage) when we can tell.
    if (action && action.hasAttack === false && action.hasDamage === false) return null;

    return { actor, isHeal: this._actionIsHeal(action) };
  }

  _actionIsHeal(action) {
    if (!action) return false;
    const type = action.actionType ?? action.data?.actionType;
    return type === "heal";
  }

  // ── HP diffing ────────────────────────────────────────────────────────────

  _initHpTracking() {
    // Runs on the client that makes the change; options travel with the update
    // to every other client, so the GM receives the pre-update HP.
    Hooks.on("preUpdateActor", (actor, changes, options) => {
      if (!foundry.utils.hasProperty(changes, "system.attributes.hp")) return;
      options[OPT_KEY] ??= {};
      options[OPT_KEY].prevHP = this._readHP(actor);
    });

    Hooks.on("updateActor", (actor, changes, options) => {
      if (!foundry.utils.hasProperty(changes, "system.attributes.hp")) return;
      const next = this._readHP(actor);
      const prev = options?.[OPT_KEY]?.prevHP ?? this._hpCache.get(actor.uuid);
      this._hpCache.set(actor.uuid, next);

      if (!prev || !this._isActiveGM() || !game.combat?.active) return;
      const current = game.settings.get(MODULE_ID, S_CURRENT);
      if (!current?.combatId) return;

      if (this._process(actor, prev, next, current))
        game.settings.set(MODULE_ID, S_CURRENT, current);
    });
  }

  /** Returns true when `current` was modified. */
  _process(actor, prev, next, current) {
    const t = this.tracker;
    let dirty = false;

    // Lethal loss (temp HP absorbs first) + nonlethal gained.
    const lethal    = Math.max(0, (prev.value + prev.temp) - (next.value + next.temp));
    const nonlethal = Math.max(0, next.nonlethal - prev.nonlethal);
    const damage    = lethal + nonlethal;
    const healed    = Math.max(0, next.value - prev.value);

    if (damage > 0) {
      const attacker     = t._popRecent(t._recentAttackers);
      const attackerIsPC = attacker && game.actors.get(attacker.actorId)?.type === "character";

      if (actor.type === "character") {
        t._acc(current, actor.id, actor.name, "damageTaken", damage);
        dirty = true;
      }
      if (attacker && attackerIsPC && attacker.actorId !== actor.id) {
        t._acc(current, attacker.actorId, attacker.actorName, "damageDealt", damage);
        dirty = true;
      }
      console.log(`Combat Stats | ${actor.name} took ${damage}${attacker ? ` from ${attacker.actorName}` : ""}`);

      // Kill: NPC crosses the death threshold on this update.
      if (actor.type === "npc") {
        const threshold = this._deathThreshold(actor);
        if (prev.value > threshold && next.value <= threshold) {
          const killer = attackerIsPC ? attacker : null;
          if (killer) t._accKill(current, killer.actorId, killer.actorName, actor.name);
          current.defeated ??= [];
          current.defeated.push({ name: actor.name, id: actor.id, killedBy: killer?.actorId ?? null });
          dirty = true;
          console.log(`Combat Stats | ${actor.name} defeated${killer ? ` by ${killer.actorName}` : ""}`);
        }
      }
    }

    if (healed > 0) {
      const healer = t._popRecent(t._recentHealers);
      if (healer && game.actors.get(healer.actorId)?.type === "character") {
        t._acc(current, healer.actorId, healer.actorName, "healingDone", healed);
        dirty = true;
        console.log(`Combat Stats | ${healer.actorName} healed ${healed}`);
      }
    }

    return dirty;
  }

  _readHP(actor) {
    const hp = actor.system?.attributes?.hp ?? {};
    return {
      value:     Number(hp.value)     || 0,
      temp:      Number(hp.temp)      || 0,
      nonlethal: Number(hp.nonlethal) || 0
    };
  }

  /**
   * "zero"   → defeated at 0 HP or below (common table practice for NPCs).
   * "negCon" → dead at −Con score (RAW). Creatures without Con die at 0.
   */
  _deathThreshold(actor) {
    if (game.settings.get(MODULE_ID, "pf1DeathThreshold") !== "negCon") return 0;
    const con = actor.system?.abilities?.con;
    const score = con?.total ?? con?.value;
    return (typeof score === "number" && score > 0) ? -score : 0;
  }

  // ── Cache seeding (covers updates where options didn't carry prevHP) ─────

  _initCacheSeeding() {
    const seed = (combat) => {
      for (const c of combat?.combatants ?? []) {
        if (c.actor) this._hpCache.set(c.actor.uuid, this._readHP(c.actor));
      }
    };
    Hooks.on("createCombatant", (c) => { if (c.actor) this._hpCache.set(c.actor.uuid, this._readHP(c.actor)); });
    Hooks.on("combatStart", (combat) => seed(combat));
    for (const combat of game.combats ?? []) seed(combat);
  }

  _isActiveGM() {
    return game.user.isGM && (game.users.activeGM?.isSelf ?? true);
  }
}
