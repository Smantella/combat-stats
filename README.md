# Combat Stats

A [FoundryVTT](https://foundryvtt.com/) module for tracking combat performance — damage dealt, damage taken, healing, kills, and more. Works with D&D 5e standard rolls and [MidiQOL](https://gitlab.com/tposney/midi-qol).

![Foundry v13](https://img.shields.io/badge/Foundry-v13-green) ![Version](https://img.shields.io/badge/version-1.5.0-blue) ![Language](https://img.shields.io/badge/lang-EN%20%7C%20IT-yellow)

---

## Features

### Recap card
At the end of each combat, a styled card is posted to chat with a summary table for all participants.

- Columns are fully configurable — show only the stats you care about
- Sub-values (Overdamage, Overhealing, Excess Taken) shown inline with tooltips
- Defeated enemies grouped by killer: `Chiappe 💀 Kobold Warrior 3×`
- **Big Hit** callout: highlights any player who landed a hit above a configurable threshold

### Charts window
A persistent window (reopenable from the sidebar) showing historical data across all fights.

- **Totals tab** — cumulative stats across all recorded fights
- **Chart tab** — bar or line chart per fight, one metric at a time, one bar per player
- **Fight tab** — drill into a single fight, with its own stats table and defeated enemies list
- All columns conditional on your tracked-stats settings

### Tracked statistics
Toggle each stat on or off from the native Foundry Settings panel:

| Stat | Description |
|---|---|
| 💀 Kills | Enemies defeated |
| ⚔️ Damage Dealt | Total damage applied |
| 💥 Overdamage | Damage beyond the target's remaining HP on a killing blow |
| 🛡️ Damage Taken | Total damage received |
| 💔 Excess Taken | Damage received beyond your own remaining HP |
| 💚 Healing Done | Total HP restored |
| 🩵 Overhealing | Healing that exceeded the target's max HP |

### Name display
Choose how character names appear everywhere — full name, first name, last name, or Foundry username.

---

## Requirements

- FoundryVTT **v13+**
- **D&D 5e** system
- [MidiQOL](https://gitlab.com/tposney/midi-qol) (optional — needed for AoE tracking and improved damage attribution)

---

## Installation

**Via Foundry module manager (recommended)**

Paste this manifest URL in *Setup → Add-on Modules → Install Module*:

```
https://raw.githubusercontent.com/Smantella/combat-stats/main/module.json
```

**Manual**

Download the latest release zip, extract it into your `Data/modules/` folder, and reload Foundry.

---

## Configuration

All settings are in **Game Settings → Module Settings → Combat Stats**.

| Setting | Description |
|---|---|
| Tracker mode | `native` (built-in hooks) or `midi` (MidiQOL integration) |
| Name display | Full / First name / Last name / Username |
| Tracked Statistics | Toggle which stats to track and display |
| Big Hit Threshold | Minimum single-hit damage to trigger the Big Hit callout (0 = disabled) |
| Big Hit Color | Text color for the Big Hit message |
| Count AoE as single hit | Sum AoE spell damage across all targets into one hit value |

The **Theme & Data** button opens a separate menu for color customization and data management (export to Excel, clear history).

---

## MidiQOL notes

With `midi` tracker mode:
- Damage is read from MidiQOL's `damageList`, which provides accurate per-target values including saves
- Each token is tracked by `targetUuid`, so copied/unlinked tokens of the same actor are counted separately
- AoE hits can optionally be summed as a single hit for the Big Hit tracker

---

## Changelog

### v1.5.0
- Settings moved to the native Foundry Game Settings panel
- Added Overdamage, Overhealing, and Excess Damage Taken tracking
- Added Big Hit achievement callout with configurable threshold and color
- Added "Count AoE as single hit" option for MidiQOL workflows
- Defeated enemies now grouped by name and killer in both recap and charts
- Overdamage / Overhealing / Excess Taken now visible in the Charts window
- Chart labels now respect the Name Display setting
- Fixed: copied/unlinked tokens of the same actor now counted as separate kills
- Fixed: decimal damage values caused by MidiQOL half-damage saves (now rounded)
- Removed: group icon for the Total row
- Removed: character portrait in recap (Foundry's chat sanitizer prevents interactive patterns)

### v1.1.0
- Initial public release

---

## Author

**Smantella** — [GitHub](https://github.com/Smantella/combat-stats)

Contributions and bug reports welcome via [Issues](https://github.com/Smantella/combat-stats/issues).

---

*Combat Stats is an independent project and is not affiliated with Foundry Gaming LLC or Wizards of the Coast.*
