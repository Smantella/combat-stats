/**
 * exporter.js v1.5.4
 * Uses SheetJS + FileSaver.js for reliable cross-platform Excel download.
 * FileSaver.js is the industry standard for browser-based file saving —
 * handles Chrome, Firefox, Safari, and Foundry on Sqyre/remote hosting.
 */

const XLSX_CDN      = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
const FILESAVER_CDN = "https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js";

let _xlsxLoaded     = false;
let _fileSaverLoaded = false;

async function loadScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url;
    s.onload  = resolve;
    s.onerror = () => reject(new Error(`Failed to load: ${url}`));
    document.head.appendChild(s);
  });
}

async function ensureDeps() {
  if (!_xlsxLoaded && !globalThis.XLSX) {
    await loadScript(XLSX_CDN);
    _xlsxLoaded = true;
  }
  if (!_fileSaverLoaded && !globalThis.saveAs) {
    await loadScript(FILESAVER_CDN);
    _fileSaverLoaded = true;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function exportToExcel(history, filename = "combat-stats") {
  if (!history?.length) {
    ui.notifications.warn("Combat Stats | No data to export.");
    return;
  }

  try {
    await ensureDeps();
  } catch(e) {
    ui.notifications.error("Combat Stats | Impossibile caricare le librerie. Controlla la connessione.");
    console.error(e);
    return;
  }

  const XLSX = globalThis.XLSX;
  const wb   = XLSX.utils.book_new();

  // ── Per-fight sheets ──────────────────────────────────────────────────────
  history.forEach((fight, idx) => {
    const chars = Object.values(fight.characters).sort((a, b) => b.damageDealt - a.damageDealt);

    const rows = [["Character", "Damage Dealt", "Damage Taken", "Healing", "Defeated"]];
    chars.forEach(c => rows.push([c.name, c.damageDealt, c.damageTaken, c.healingDone, c.kills ?? 0]));

    const tot = chars.reduce((a, c) => [a[0]+c.damageDealt, a[1]+c.damageTaken, a[2]+c.healingDone, a[3]+(c.kills??0)], [0,0,0,0]);
    rows.push(["TOTAL", ...tot]);

    // Defeated enemies section
    if ((fight.defeated ?? []).length > 0) {
      rows.push([]);
      rows.push(["Defeated Enemies", "Killed By"]);
      fight.defeated.forEach(d => {
        const killerName = d.killedBy ? (game.actors.get(d.killedBy)?.name ?? "Unknown") : "—";
        rows.push([d.name, killerName]);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 12 }];
    _boldRow(ws, XLSX, 0);

    XLSX.utils.book_append_sheet(wb, ws, _sheetName(fight.name, idx + 1));
  });

  // ── All Fights summary sheet ──────────────────────────────────────────────
  const summaryRows = [["Fight", "Date", "Character", "Damage Dealt", "Damage Taken", "Healing", "Defeated"]];
  history.forEach(fight => {
    const date = new Date(fight.date).toLocaleDateString("en-GB");
    Object.values(fight.characters)
      .sort((a, b) => b.damageDealt - a.damageDealt)
      .forEach(c => summaryRows.push([fight.name, date, c.name, c.damageDealt, c.damageTaken, c.healingDone, c.kills ?? 0]));
    summaryRows.push([]);
  });
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 12 }];
  _boldRow(wsSummary, XLSX, 0);
  XLSX.utils.book_append_sheet(wb, wsSummary, "All Fights");

  // ── Save with FileSaver.js (works on all browsers + Sqyre) ───────────────
  const safeFilename = `${filename}_${_dateStamp()}.xlsx`;
  const wbArray = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob    = new Blob([wbArray], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  globalThis.saveAs(blob, safeFilename);
  ui.notifications.info(`Combat Stats | Exported: ${safeFilename}`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _sheetName(name, idx) {
  return ((name ?? `Fight ${idx}`).replace(/[\\\/\?\*\[\]:]/g, "").trim().slice(0, 31)) || `Fight ${idx}`;
}

function _dateStamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}

function _boldRow(ws, XLSX, rowIdx) {
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let col = range.s.c; col <= range.e.c; col++) {
    const addr = XLSX.utils.encode_cell({ r: rowIdx, c: col });
    if (ws[addr]) ws[addr].s = { font: { bold: true } };
  }
}
