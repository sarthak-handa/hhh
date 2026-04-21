const XLSX = require("xlsx");
const fs = require('fs');
const apiJS = fs.readFileSync('api/forecast.js', 'utf8');

// We just copy the exact functions from api/forecast.js
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const CATEGORY_KEYS = ["JSW BAWAL", "SPARE", "CRM", "TANDEM MILL", "6HI", "CGL", "GI/GL", "ARP", "CCL", "REVAMP", "TRIM", "ELECTRICAL", "MILL BEARING", "SPM", "APL", "SLITTING", "PICKLING"];
const CATEGORY_RESULTS = ["SPARE", "SPARE", "CRM", "CRM", "CRM", "CGL", "CGL", "ARP", "CCL", "REVAMP", "TRIMMING", "ELECTRICAL", "MILL BEARING", "SPM", "APL", "SLITTING", "PICKLING"];

function deriveCategory(projectName) {
  if (!projectName) return "OTHER";
  const dashIdx = String(projectName).indexOf("-");
  const line = dashIdx > -1 ? String(projectName).substring(dashIdx + 1).toUpperCase() : String(projectName).toUpperCase();
  for (let i = 0; i < CATEGORY_KEYS.length; i++) {
    if (line.includes(CATEGORY_KEYS[i])) {
      return CATEGORY_RESULTS[i];
    }
  }
  return "OTHER";
}

function excelSerialToDate(serial) {
  if (!serial) return null;
  if (typeof serial === "string") {
    const s = serial.trim();
    // Check if it's "May/26", "Apr-26", etc.
    const mmyyMatch = s.match(/^([A-Za-z]{3})[\/\-](\d{2})$/);
    if (mmyyMatch) {
      const monthStr = mmyyMatch[1].charAt(0).toUpperCase() + mmyyMatch[1].slice(1).toLowerCase();
      const mIdx = MONTH_SHORT.indexOf(monthStr);
      if (mIdx !== -1) {
        return new Date(2000 + parseInt(mmyyMatch[2]), mIdx, 15, 12, 0, 0); // Mid-month arbitrary day
      }
    }
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  if (typeof serial !== "number") return null;
  return new Date((serial - 25569) * 86400000);
}

function normalizeStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s.includes("not disp")) return "Not Dispatched";
  if (s === "dispatched" || s === "disp." || s === "disp") return "Dispatched";
  return "Not Dispatched";
}

function mapSource(source) {
  if (!source) return "Inhouse";
  const s = String(source).toUpperCase().trim();
  return s.includes("BOI") ? "BOI" : "Inhouse";
}

function isInFY2026_27(dispatchDate) {
  if (!(dispatchDate instanceof Date) || isNaN(dispatchDate)) return false;
  const fyStart = new Date(2026, 3, 1, 0, 0, 0);   // April 1, 2026
  const fyEnd = new Date(2027, 2, 31, 23, 59, 59); // March 31, 2027
  return dispatchDate >= fyStart && dispatchDate <= fyEnd;
}

function formatMonthYear(date) {
  if (!(date instanceof Date) || isNaN(date)) return "";
  const m = MONTH_SHORT[date.getMonth()];
  const y = String(date.getFullYear()).slice(-2);
  return `${m}/${y}`;
}

const workbook = XLSX.readFile("SALES & CASH FLOW (1).xlsx");
const sheet = workbook.Sheets["PROJECTS"];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
const headerSkipped = rows.slice(1);

const data = headerSkipped
  .filter((r) => r[0] && r[0] !== "PROJECT")
  .map((r) => {
    const dispatchDate = excelSerialToDate(r[8]);
    const category = deriveCategory(r[0]);
    const monthDisplay = formatMonthYear(dispatchDate);
    const shortMonth = dispatchDate instanceof Date && !isNaN(dispatchDate) 
      ? MONTH_SHORT[dispatchDate.getMonth()] 
      : "";

    return {
      project: String(r[0]).trim(),
      source: mapSource(r[1]),
      pm: String(r[2] || "").trim(),
      assembly: String(r[3] || "").trim(),
      billing: Number(String(r[6] || 0).replace(/[^0-9.-]/g, "")) || 0,
      status: normalizeStatus(r[7]),
      dispatchMonth: dispatchDate,
      month: shortMonth,
      monthDisplay: monthDisplay,
      category: category,
    };
  })
  .filter((d) => isInFY2026_27(d.dispatchMonth));

console.log("Filtered Data length:", data.length);
if (data.length > 0) {
    console.log("Sample Data Output:", JSON.stringify(data[0]));
} else {
    // let's print why by checking unfiltered
    const unfiltered = headerSkipped
        .filter((r) => r[0] && r[0] !== "PROJECT")
        .map(r => ({ dateRaw: r[8], dateParsed: excelSerialToDate(r[8]) }));
    console.log("Unfiltered stats:", unfiltered.filter(x => x.dateParsed !== null).length, "dates parsed successfully.");
}
