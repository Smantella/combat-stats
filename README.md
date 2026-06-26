# Combat Stats — Foundry VTT Module

Tracks **damage dealt**, **damage taken**, and **healing done** per character across combats. Shows a summary table at the end of every fight and a historical chart window accessible from the sidebar.

## Installation

1. Copy the `combat-stats` folder into your Foundry `Data/modules/` directory.
2. In Foundry → **Module Management**, enable **Combat Stats**.
3. The module is active immediately — no configuration needed.

## How it works

| Event | What's tracked |
|---|---|
| Attack workflow → damage applied | Damage dealt (attacker) + Damage taken (defender) |
| Spell/item workflow → healing applied | Healing done (caster) |
| GM clicks **End Combat** (deletes the combat) | Summary popup appears; fight saved to history |

## UI

- **Post-combat summary**: pops up automatically for the GM at end of every combat.  
- **History / Charts**: click the **Combat Stats** button at the bottom of the Chat sidebar. Toggle between Damage Dealt / Taken / Healed and Bar / Line views. Use the dropdown to re-open any past fight's summary.

## Known Limitations & Edge Cases

### Attacker attribution
The module identifies the attacker by looking at the **speaker of the most recent chat message** when damage is applied. This works reliably for the standard D&D 5e attack workflow (click item → roll attack → apply damage). It will **not** work correctly for:
- Raw `/roll` commands (no speaker context)
- Damage applied via macros that don't go through the item workflow
- AoE spells where multiple targets are hit in sequence (attacker resolves correctly, but only the most recent message speaker is used)

### Healing attribution
Uses the `dnd5e.healActor` hook. Captured correctly for:
- Cure Wounds, Healing Word, Lay on Hands via item card
- Potions used through the item workflow

**Not** captured:
- HP typed manually in the character sheet
- Passive regeneration (e.g. Troll regen)
- Some homebrew automation flows

### "Unknown Source" entries
If attacker resolution fails, damage is bucketed under **Unknown Source** in the table. This is intentional — the damage isn't lost, but it can't be attributed to a specific character.

## Compatibility
- Foundry VTT: v13
- System: **D&D 5e only** (hooks are system-specific)
- MidiQOL: should be compatible (both use the same underlying dnd5e hooks)
- Carousel Combat Tracker
