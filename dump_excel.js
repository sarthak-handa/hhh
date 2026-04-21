const XLSX = require('xlsx');
const path = require('path');

function dumpExcel(filename) {
    console.log(`\n--- Dumping ${filename} ---`);
    try {
        const filePath = path.join(process.cwd(), filename);
        console.log(`Reading: ${filePath}`);
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0]; 
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        console.log(`Sheet Name: ${sheetName}`);
        console.log('Headers (Row 1):', rows[0]);
        console.log('Row 2:', rows[1]);
        console.log('Row 3:', rows[2]);
        console.log('Row 4:', rows[3]);
        console.log('Row 20 (Sample):', rows[19]);
    } catch (e) {
        console.error(`Error reading ${filename}:`, e.message);
    }
}

dumpExcel('SALES & CASH FLOW (1).xlsx');
dumpExcel('ActualBilling (1).xlsx');
