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

let fiscalYearStart;
let fiscalYearEnd;

function isInCurrentFiscalWindow(dispatchDate) {
  if (!(dispatchDate instanceof Date) || isNaN(dispatchDate)) return false;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const startOfCurrentMonth = new Date(currentYear, currentMonth, 1);

  // Broaden window: Show data from 12 months ago up to end of next fiscal year
  const dataStartDate = new Date(startOfCurrentMonth);
  dataStartDate.setMonth(dataStartDate.getMonth() - 12);

  let fiscalYearStart;
  if (currentMonth <= 2) {
    fiscalYearStart = currentYear - 1;
  } else {
    fiscalYearStart = currentYear;
  }
  const fiscalEndDate = new Date(fiscalYearStart + 2, 2, 31, 23, 59, 59); // Next year's end
  return dispatchDate >= dataStartDate && dispatchDate <= fiscalEndDate;
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
        const dispatchDate = r[18] ? new Date(r[18]) : null;
        const line = extractLine(r[0]);
        return {
          project: String(r[0]).trim(),
          pm: String(r[2] || "").trim(),
          assembly: String(r[3] || "").trim(),
          billing: Number(String(r[6] || 0).replace(/[^0-9.-]/g, "")) || 0,
          status: normalizeStatus(r[7]),
          dispatchMonth: dispatchDate,
          month: dispatchDate ? dispatchDate.toLocaleString("en-US", { month: "short" }) : "",
          line,
          category: mapCategory(line),
        };
      })
      .filter((d) => isInCurrentFiscalWindow(d.dispatchMonth));

    res.status(200).json({
      source: "Vercel Serverless",
      fiscalLogic: "Current month -> March",
      fiscalYear: (fiscalYearStart || "2025") + "-" + (fiscalYearEnd || "2026"),
      lastUpdated: metaRes.data.lastModifiedDateTime,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch dashboard data", message: error.message });
  }
};
