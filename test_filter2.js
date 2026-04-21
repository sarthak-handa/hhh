const XLSX = require("xlsx");
const workbook = XLSX.readFile("SALES & CASH FLOW (1).xlsx");
const sheet = workbook.Sheets["PROJECTS"];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
const headerSkipped = rows.slice(1);

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function excelSerialToDate(serial) {
  if (!serial) return null;
  if (typeof serial === "string") {
    const s = serial.trim();
    const mmyyMatch = s.match(/^([A-Za-z]{3})[\/\-](\d{2})$/);
    if (mmyyMatch) {
      const monthStr = mmyyMatch[1].charAt(0).toUpperCase() + mmyyMatch[1].slice(1).toLowerCase();
      const mIdx = MONTH_SHORT.indexOf(monthStr);
      if (mIdx !== -1) {
        return new Date(2000 + parseInt(mmyyMatch[2]), mIdx, 15, 12, 0, 0); 
      }
    }
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  if (typeof serial !== "number") return null;
  return new Date((serial - 25569) * 86400000);
}

function isInFY2026_27(dispatchDate) {
  if (!(dispatchDate instanceof Date) || isNaN(dispatchDate)) return false;
  const fyStart = new Date(2026, 3, 1, 0, 0, 0);
  const fyEnd = new Date(2027, 2, 31, 23, 59, 59);
  return dispatchDate >= fyStart && dispatchDate <= fyEnd;
}

let count = 0;
let nullCount = 0;
headerSkipped.forEach(r => {
  const dt = excelSerialToDate(r[8]);
  if(isInFY2026_27(dt)) count++;
  else if (dt === null && r[8]) nullCount++;
});
console.log("Valid rows for 26-27:", count, "Failed parsing:", nullCount);
