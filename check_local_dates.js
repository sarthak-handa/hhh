const XLSX = require("xlsx");
const workbook = XLSX.readFile("SALES & CASH FLOW (1).xlsx");
const sheet = workbook.Sheets["PROJECTS"];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
for(let i=1; i<10; i++) {
  console.log("Row", i, "Col I (type:", typeof rows[i][8], "):", rows[i][8]);
  const s = rows[i][8];
  if(typeof s === 'number') {
    const d = new Date((s - 25569) * 86400000);
    console.log("  Parsed date:", d);
  } else if (typeof s === 'string') {
    const d = new Date(s);
    console.log("  Parsed date:", d);
  }
}
