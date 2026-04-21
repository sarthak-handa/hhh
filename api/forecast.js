const axios = require("axios");
const XLSX = require("xlsx");

// --- CONFIGURATION ---
const TENANT_ID = process.env.TENANT_ID || "a0e08c58-7003-49f2-a898-bfb4a1b05815";
const CLIENT_ID = process.env.CLIENT_ID || "674b7459-54de-4d1d-b13a-0070c7b57d58";
const CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET;
const DRIVE_ID = "b!-1MZkE8WdUCwHHHaP1rzH_PqGBIe57tJvXHEOqKXXGHlO_rJZfmnQLPiI9rdBJ_7";
const FILE_ID = "01YUMYDKJKYCODJHCFLVEJRHTMXUVRRHRO";
const SHEET_NAME = "PROJECTS";

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

function extractLine(project) {
  if (!project) return "";
  const parts = String(project).split("-");
  return parts[parts.length - 1].trim();
}

function mapCategory(line) {
  const l = line.toUpperCase();
  if (["6HI CRM", "4HI CRM", "CRM", "6HI", "6 STAND TANDEM MILL", "5 STAND TANDEM MILL"].includes(l)) return "CRM";
  if (["CGL", "GI/GL LINE"].includes(l)) return "CGL";
  if (["SPARE", "SPARES", "POR SPARE", "JSW BAWAL"].includes(l)) return "SPARE";
  if (l === "ARP") return "ARP";
  if (l === "CCL") return "CCL";
  if (["REVAMP", "TPI REVAMP"].includes(l)) return "REVAMP";
  if (["TRIMMING", "TRIMMER"].includes(l)) return "TRIMMING";
  if (["PICKLING", "5 TANK PICKLING"].includes(l)) return "PICKLING";
  if (["4HI SPM", "SPM"].includes(l)) return "SPM";
  if (l === "APL") return "APL";
  return "OTHER";
}

/**
 * Convert Excel serial number to JS Date.
 * Excel serial 1 = Jan 1, 1900. JS epoch = Jan 1, 1970.
 */
function excelSerialToDate(serial) {
  if (!serial) return null;
  // If it's already a string date, try parsing directly
  if (typeof serial === "string") {
    const d = new Date(serial);
    return isNaN(d) ? null : d;
  }
  if (typeof serial !== "number") return null;
  // Excel serial to JS date (subtract Excel epoch offset)
  return new Date((serial - 25569) * 86400000);
}

/**
 * Check if a date falls within FY 2026-27 (April 2026 to March 2027).
 */
function isInFY2026_27(dispatchDate) {
  if (!(dispatchDate instanceof Date) || isNaN(dispatchDate)) return false;
  const fyStart = new Date(2026, 3, 1, 0, 0, 0);     // April 1, 2026
  const fyEnd = new Date(2027, 2, 31, 23, 59, 59);    // March 31, 2027
  return dispatchDate >= fyStart && dispatchDate <= fyEnd;
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
        // Column R (index 17) = CATEGORY
        const category = r[17] ? String(r[17]).trim() : extractLine(r[0]);
        // Column S (index 18) = DISPATCH MONTH NAME (human readable, e.g., "Apr 2027")
        const monthName = r[18] ? String(r[18]).trim() : "";
        // Extract just the short month (e.g., "Apr" from "Apr 2027")
        const shortMonth = monthName ? monthName.split(" ")[0] : (dispatchDate ? dispatchDate.toLocaleString("en-US", { month: "short" }) : "");

        return {
          project: String(r[0]).trim(),                        // Column A
          source: mapSource(r[1]),                             // Column B (BOI/MANF.)
          pm: String(r[2] || "").trim(),                       // Column C (PM)
          assembly: String(r[3] || "").trim(),                 // Column D (ASSEMBLY)
          billing: Number(String(r[6] || 0).replace(/[^0-9.-]/g, "")) || 0,  // Column G
          status: normalizeStatus(r[7]),                       // Column H (DISP. STATUS)
          dispatchMonth: dispatchDate,                         // Column I (date object)
          month: shortMonth,                                   // Short month name
          monthDisplay: monthName,                             // Full month display
          line: extractLine(r[0]),
          category: mapCategory(category),
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
