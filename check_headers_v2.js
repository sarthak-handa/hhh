const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

function dumpHeaders(filename) {
    let out = `\n--- ${filename} ---\n`;
    try {
        const filePath = path.join(process.cwd(), filename);
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const headers = rows[0];
        out += 'Headers with indices:\n';
        headers.forEach((h, i) => {
            out += `${i}: ${h}\n`;
        });
    } catch (e) {
        out += `Error: ${e.message}\n`;
    }
    return out;
}

const result = dumpHeaders('SALES & CASH FLOW (1).xlsx') + dumpHeaders('ActualBilling (1).xlsx');
fs.writeFileSync('headers_output.txt', result);
console.log('Done');
