const XLSX = require('xlsx');
const path = require('path');

function dumpHeaders(filename) {
    console.log(`\n--- ${filename} ---`);
    try {
        const filePath = path.join(process.cwd(), filename);
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const headers = rows[0];
        console.log('Headers with indices:');
        headers.forEach((h, i) => {
            if (h) console.log(`${i}: ${h}`);
        });
    } catch (e) {
        console.error(`Error: ${e.message}`);
    }
}

dumpHeaders('SALES & CASH FLOW (1).xlsx');
dumpHeaders('ActualBilling (1).xlsx');
