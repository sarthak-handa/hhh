const XLSX = require("xlsx");
const workbook = XLSX.readFile("SALES & CASH FLOW (1).xlsx");
const sheet = workbook.Sheets["PROJECTS"];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
const headerSkipped = rows.slice(1);

function excelSerialToDate(serial) {
  if (!serial) return null;
  if (typeof serial === "string") {
    const d = new Date(serial);
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
headerSkipped.forEach(r => {
  const dt = excelSerialToDate(r[8]);
  if(isInFY2026_27(dt)) count++;
});
console.log("Valid rows for 26-27:", count);
