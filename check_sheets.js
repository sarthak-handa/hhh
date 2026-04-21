const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

function dumpSheetNames(filename) {
    let out = `\n--- ${filename} ---\n`;
    try {
        const filePath = path.join(process.cwd(), filename);
        const workbook = XLSX.readFile(filePath);
        out += 'Sheet Names: ' + workbook.SheetNames.join(', ') + '\n';
        workbook.SheetNames.forEach(sn => {
            const sheet = workbook.Sheets[sn];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            out += `\nSheet: ${sn}\n`;
            out += 'Headers (Row 1): ' + JSON.stringify(rows[0]) + '\n';
            out += 'Row 2: ' + JSON.stringify(rows[1]) + '\n';
        });
    } catch (e) {
        out += `Error: ${e.message}\n`;
    }
    return out;
}

const result = dumpSheetNames('SALES & CASH FLOW (1).xlsx') + dumpSheetNames('ActualBilling (1).xlsx');
fs.writeFileSync('sheets_output.txt', result);
console.log('Done');
