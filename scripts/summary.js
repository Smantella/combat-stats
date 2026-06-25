/**
 * summary.js v1.6.5
 * Chat card recap: actor portrait thumbnail, icon-only headers, no date in header.
 */

const _posted = new Set();

export class SummaryApp {

  static openOnce(record) {
    if (_posted.has(record.id)) return;
    _posted.add(record.id);
    SummaryApp.postToChat(record);
  }

  static async postToChat(record) {
    const chars = Object.values(record.characters ?? {})
      .sort((a, b) => b.damageDealt - a.damageDealt);

    if (!chars.length) return;

    const totals = chars.reduce(
      (a, c) => { a.d += c.damageDealt??0; a.t += c.damageTaken??0; a.h += c.healingDone??0; a.k += c.kills??0; return a; },
      { d: 0, t: 0, h: 0, k: 0 }
    );

    // ── Resolve actor portrait for each character ──────────────────────
    // Match by actor id first, then by name fallback
    function getPortrait(c) {
      // characters are stored by actorId as key
      const actor = game.actors?.get(c.actorId) ?? game.actors?.getName(c.name);
      return actor?.img ?? "icons/svg/mystery-man.svg";
    }

    // ── Player rows ────────────────────────────────────────────────────
    const rows = chars.map(c => {
      const img = getPortrait(c);
      return `
      <tr>
        <td style="padding:4px 8px;width:36px;">
          <img src="${img}" style="width:32px;height:32px;border-radius:4px;
                object-fit:cover;object-position:top center;
                border:1px solid rgba(212,175,55,0.4);display:block;">
        </td>
        <td style="padding:4px 6px;font-weight:600;font-size:0.88em;">${c.name}</td>
        <td style="padding:4px 6px;text-align:right;color:#ce4141;font-weight:700;">${c.damageDealt ?? 0}</td>
        <td style="padding:4px 6px;text-align:right;color:#e67e22;">${c.damageTaken ?? 0}</td>
        <td style="padding:4px 6px;text-align:right;color:#2ecc71;">${c.healingDone ?? 0}</td>
        <td style="padding:4px 6px;text-align:right;color:#d4af37;">${c.kills ?? 0}</td>
      </tr>`;
    }).join("");

    // ── Defeated enemies ───────────────────────────────────────────────
    const defeated = (record.defeated ?? []);
    const defeatedHTML = defeated.length ? `
      <div style="padding:6px 10px 8px;border-top:1px solid rgba(212,175,55,0.25);">
        <div style="font-size:0.78em;color:#d4af37;font-weight:700;margin-bottom:5px;">
          <i class="fa-solid fa-skull"></i> ${game.i18n.localize("COMBATSTATS.Summary.EnemiesDefeated")} (${defeated.length})
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
          ${defeated.map(d => {
            const killer = d.killedBy ? game.actors.get(d.killedBy)?.name : null;
            return `<span style="background:rgba(206,65,65,0.12);border:1px solid rgba(206,65,65,0.25);
                          border-radius:12px;padding:2px 10px;font-size:0.82em;display:inline-flex;align-items:center;gap:4px;">
              ${killer ? `<span style="color:#d4af37;font-weight:700;">${killer}</span>
              <i class="fa-solid fa-skull" style="color:#ce4141;font-size:0.8em;"></i>` : ""}
              <span style="opacity:0.75;">${d.name}</span>
            </span>`;
          }).join("")}
        </div>
      </div>` : "";

    // ── Full card — no date in header, icon-only column headers ────────
    const content = `
<div style="font-family:'Signika',sans-serif;border:2px solid #d4af37;border-radius:8px;
            background:#1a1a24;overflow:hidden;color:#eee;">

  <div style="background:linear-gradient(135deg,#d4af37,#b8962a);color:#1a1a24;
              padding:7px 12px;display:flex;align-items:center;gap:8px;">
    <i class="fa-solid fa-swords" style="font-size:0.9em;"></i>
    <strong style="font-size:1em;">${record.name}</strong>
  </div>

  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="background:rgba(212,175,55,0.08);">
        <th style="padding:4px 8px;width:36px;border-bottom:1px solid rgba(212,175,55,0.25);"></th>
        <th style="padding:4px 6px;text-align:left;color:rgba(212,175,55,0.7);font-size:0.78em;border-bottom:1px solid rgba(212,175,55,0.25);"></th>
        <th style="padding:4px 6px;text-align:right;border-bottom:1px solid rgba(212,175,55,0.25);" title="Damage Dealt">
          <i class="fa-solid fa-sword" style="color:#ce4141;"></i>
        </th>
        <th style="padding:4px 6px;text-align:right;border-bottom:1px solid rgba(212,175,55,0.25);" title="Damage Taken">
          <i class="fa-solid fa-shield-halved" style="color:#e67e22;"></i>
        </th>
        <th style="padding:4px 6px;text-align:right;border-bottom:1px solid rgba(212,175,55,0.25);" title="Healing">
          <i class="fa-solid fa-heart" style="color:#2ecc71;"></i>
        </th>
        <th style="padding:4px 6px;text-align:right;border-bottom:1px solid rgba(212,175,55,0.25);" title="Defeated Enemies">
          <i class="fa-solid fa-skull" style="color:#d4af37;"></i>
        </th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr style="background:rgba(212,175,55,0.06);border-top:1px solid rgba(212,175,55,0.35);">
        <td style="padding:4px 8px;"></td>
        <td style="padding:4px 6px;font-weight:700;color:#d4af37;font-size:0.85em;">
          ${game.i18n.localize("COMBATSTATS.Summary.Total")}
        </td>
        <td style="padding:4px 6px;text-align:right;font-weight:700;color:#ce4141;">${totals.d}</td>
        <td style="padding:4px 6px;text-align:right;color:#e67e22;">${totals.t}</td>
        <td style="padding:4px 6px;text-align:right;color:#2ecc71;">${totals.h}</td>
        <td style="padding:4px 6px;text-align:right;color:#d4af37;">${totals.k}</td>
      </tr>
    </tfoot>
  </table>

  ${defeatedHTML}
</div>`;

    await ChatMessage.create({
      content,
      speaker: { alias: "Combat Stats" },
      type:    CONST.CHAT_MESSAGE_STYLES?.OTHER ?? 0,
      flags:   { "combat-stats": { summary: true, fightId: record.id } }
    });
  }
}
