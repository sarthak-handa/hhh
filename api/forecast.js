const axios = require("axios");
const XLSX = require("xlsx");

// --- CONFIGURATION ---
const TENANT_ID = process.env.TENANT_ID || "a0e08c58-7003-49f2-a898-bfb4a1b05815";
const CLIENT_ID = process.env.CLIENT_ID || "674b7459-54de-4d1d-b13a-0070c7b57d58";
const CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET;
const DRIVE_ID = "b!-1MZkE8WdUCwHHHaP1rzH_PqGBIe57tJvXHEOqKXXGHlO_rJZfmnQLPiI9rdBJ_7";
const FILE_ID = "01YUMYDKJKYCODJHCFLVEJRHTMXUVRRHRO";
const SHEET_NAME = "PROJECTS";

// --- SHORT MONTH NAMES ---
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// --- UTILS ---
async function getAccessToken() {
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.append("client_id", CLIENT_ID);
  params.append("client_secret", CLIENT_SECRET);
  params.append("grant_type", "client_credentials");
  params.append("scope", "https://graph.microsoft.com/.default");
  const res = await axios.post(url, params);
  return res.data.access_token;
}

function normalizeStatus(val) {
  if (!val) return "Not Dispatched";
  const v = String(val).trim().toLowerCase();
  if (v === "disp." || v === "disp" || v === "dispatched") return "Dispatched";
  if (v.includes("hold")) return "Hold";
  return "Not Dispatched";
}

/**
 * Convert Excel serial number to JS Date.
 */
function excelSerialToDate(serial) {
  if (!serial) return null;
  if (typeof serial === "string") {
    const d = new Date(serial);
    return isNaN(d) ? null : d;
  }
  if (typeof serial !== "number") return null;
  return new Date((serial - 25569) * 86400000);
}

/**
 * Format a Date as "May/26" (short month + "/" + 2-digit year).
 */
function formatMonthYear(date) {
  if (!(date instanceof Date) || isNaN(date)) return "";
  const m = MONTH_SHORT[date.getMonth()];
  const y = String(date.getFullYear()).slice(-2);
  return `${m}/${y}`;
}

/**
 * Check if a date falls within FY 2026-27 (April 2026 to March 2027).
 */
function isInFY2026_27(dispatchDate) {
  if (!(dispatchDate instanceof Date) || isNaN(dispatchDate)) return false;
  const fyStart = new Date(2026, 3, 1, 0, 0, 0);
  const fyEnd = new Date(2027, 2, 31, 23, 59, 59);
  return dispatchDate >= fyStart && dispatchDate <= fyEnd;
}

/**
 * Derive category from Column A project name.
 * Replicates the Excel LET/XMATCH formula logic exactly:
 *   1. Take everything after the first "-" in the project name (TEXTAFTER)
 *   2. Search for keywords IN ORDER — first match wins
 *
 * Keyword order and results match the Excel formula exactly.
 */
const CATEGORY_KEYS = [
  "JSW BAWAL", "SPARE", "SPARES", "CRM", "TANDEM MILL",
  "6HI", "CGL", "GI/GL", "ARP", "CCL",
  "REVAMP", "TRIM", "ELECTRICAL", "MILL BEARING",
  "SPM", "APL", "SLITTING", "PICKLING", "REWINDING",
];
const CATEGORY_RESULTS = [
  "SPARE",     "SPARE",  "SPARE",  "CRM",  "CRM",
  "CRM",       "CGL",    "CGL",    "ARP",  "CCL",
  "REVAMP",    "TRIMMING","ELECTRICAL","MILL BEARING",
  "SPM",       "APL",    "SLITTING","PICKLING","REWINDING",
];

function deriveCategory(projectName) {
  if (!projectName) return "OTHER";
  // Get everything after the first "-" (like TEXTAFTER in Excel)
  const dashIdx = String(projectName).indexOf("-");
  if (dashIdx === -1) return "OTHER";
  const line = String(projectName).substring(dashIdx + 1).toUpperCase();

  for (let i = 0; i < CATEGORY_KEYS.length; i++) {
    if (line.includes(CATEGORY_KEYS[i])) {
      return CATEGORY_RESULTS[i];
    }
  }
  return "OTHER";
}

/**
 * Map Column B (BOI/MANF.) to a source category.
 */
function mapSource(val) {
  if (!val) return "";
  const v = String(val).replace(/\s+/g, "").toUpperCase();
  if (v.includes("BOI")) return "BOI";
  if (/UNIT-?[123]/.test(v)) return "Inhouse";
  return String(val).trim();
}

// --- MAIN HANDLER ---
module.exports = async (req, res) => {
  try {
    const token = await getAccessToken();
    const fileUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${FILE_ID}/content`;
    const metadataUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${FILE_ID}`;

    const [excelRes, metaRes] = await Promise.all([
      axios.get(fileUrl, { headers: { Authorization: `Bearer ${token}` }, responseType: "arraybuffer" }),
      axios.get(metadataUrl, { headers: { Authorization: `Bearer ${token}` } })
    ]);

    const workbook = XLSX.read(excelRes.data);
    const sheet = workbook.Sheets[SHEET_NAME];
    if (!sheet) throw new Error("PROJECTS sheet not found");

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
    const headerSkipped = rows.slice(1);

    const data = headerSkipped
      .filter((r) => r[0] && r[0] !== "PROJECT")
      .map((r) => {
        // Column I (index 8) = DISP. MONTH (Excel serial number)
        const dispatchDate = excelSerialToDate(r[8]);
        // Derive category from Column A — NO dependency on Column R
        const category = deriveCategory(r[0]);
        // Format month from Column I — NO dependency on Column S
        const monthDisplay = formatMonthYear(dispatchDate); // "May/26"
        const shortMonth = dispatchDate ? MONTH_SHORT[dispatchDate.getMonth()] : "";

        return {
          project: String(r[0]).trim(),                        // Column A
          source: mapSource(r[1]),                             // Column B
          pm: String(r[2] || "").trim(),                       // Column C
          assembly: String(r[3] || "").trim(),                 // Column D
          billing: Number(String(r[6] || 0).replace(/[^0-9.-]/g, "")) || 0,  // Column G
          status: normalizeStatus(r[7]),                       // Column H
          dispatchMonth: dispatchDate,                         // Column I (date object)
          month: shortMonth,                                   // "May" (for chart grouping)
          monthDisplay: monthDisplay,                          // "May/26" (for display)
          category: category,                                  // Derived from Column A
        };
      })
      .filter((d) => isInFY2026_27(d.dispatchMonth));

    res.status(200).json({
      source: "Vercel Serverless",
      fiscalYear: "2026-27",
      lastUpdated: metaRes.data.lastModifiedDateTime,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch dashboard data", message: error.message });
  }
};
