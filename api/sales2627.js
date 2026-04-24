const axios = require("axios");
const XLSX = require("xlsx");

// --- CONFIGURATION ---
const TENANT_ID = process.env.TENANT_ID || "a0e08c58-7003-49f2-a898-bfb4a1b05815";
const CLIENT_ID = process.env.CLIENT_ID || "674b7459-54de-4d1d-b13a-0070c7b57d58";
const CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET;
const DRIVE_ID = "b!-1MZkE8WdUCwHHHaP1rzH_PqGBIe57tJvXHEOqKXXGHlO_rJZfmnQLPiI9rdBJ_7";
const FILE_ID = "01YUMYDKJ4P2DAPAXKUNCJH5CCCZ3RZ35F";
const SHEET_NAME = "Sheet1";

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
    if (!sheet) throw new Error("Sheet1 sheet not found");

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
    const headerSkipped = rows.slice(1);

    const data = headerSkipped
      .filter((r) => r[0] && r[0] !== "PROJECT")
      .map((r) => {
        const dispatchDate = r[18] ? new Date(r[18]) : null;
        const line = r[17];
        return {
          project: String(r[0]).trim(),
          pm: String(r[2] || "").trim(),
          assembly: String(r[3] || "").trim(),
          billing: Number(String(r[6] || 0).replace(/[^0-9.-]/g, "")) || 0,
          status: normalizeStatus(r[7]),
          dispatchMonth: dispatchDate,
          month: dispatchDate ? dispatchDate.toLocaleString("en-US", { month: "short" }) : "",
          line,
          category: line,
        };
      })
      .filter((d) => {
        if (!(d.dispatchMonth instanceof Date) || isNaN(d.dispatchMonth)) return false;
        const fyStart = new Date(2026, 3, 1, 0, 0, 0); // April 1, 2026
        const fyEnd = new Date(2027, 2, 31, 23, 59, 59); // March 31, 2027
        return d.dispatchMonth >= fyStart && d.dispatchMonth <= fyEnd;
      });

    res.status(200).json({
      source: "Vercel Serverless",
      fiscalLogic: "April 2026 to March 2027",
      lastUpdated: metaRes.data.lastModifiedDateTime,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch sales 26-27 data", message: error.message });
  }
};
