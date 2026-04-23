const axios = require("axios");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const AI_PROVIDER =
  process.env.AI_PROVIDER ||
  (OPENAI_API_KEY ? "openai" : "gemini");

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 12;
const requestLog = new Map();

const SYSTEM_PROMPT = `
You are YD Insights Copilot for YOGIJI DIGI.

Your responsibilities:
- answer like a premium business copilot and general-purpose assistant
- help users understand the live dashboard and visible website data
- answer company, workflow, project, KPI, and business questions clearly
- answer broader general questions helpfully when the user asks them

YOGIJI DIGI dashboard guidance:
- "forecast" means planned billing and assemblies to be dispatched
- "actuals" means realized billing and assemblies dispatched
- billing values may be shown in INR crores (Cr)
- the fiscal flow commonly runs Apr to Mar
- common statuses include Dispatched, Not Dispatched, and Hold
- common source types include BOI and Inhouse

Rules:
- when page-specific numeric data is present in the provided dashboard snapshot, treat it as the source of truth
- if the user asks about what is on the page, answer from the current page snapshot first
- mention the current mode or active filters when they materially affect the answer
- do not mention model providers unless the user asks
- do not invent hidden data that is not present
- if the snapshot does not contain a requested fact, say that plainly and then help with the closest available information
- be concise, accurate, and professional
`.trim();

const COMPANY_PROFILE = `
YOGIJI DIGI company brief:
- Type: private industrial machinery manufacturer
- Headquarters: Faridabad, Haryana, India
- Industry: flat steel processing and industrial automation
- Positioning: turnkey solution provider for downstream flat steel processing plants
- Identity: integrated engineering company combining mechanical/process capabilities and electrical/automation integration

Leadership and named business context:
- Navneet Singh Gill: Managing Director
- Satish Kumar Tripathi: Director
- Sameer Bansal: Director
- Varun Jay Rana: operations and engineering leadership context
- Aseem Gill: business and sustainability leadership context

Core product lines and offerings:
- Cold Rolling Mills (CRM), Skin Pass Mills, Tube Mills
- Slitting Lines, Cut-to-Length Lines, Rewinding and Trimming systems
- Color Coating Lines (CCL), Galvanizing (GI), Galvalume (GL)
- Pickling Lines and Acid Regeneration Plants
- PLC, SCADA, Drives, MCC and PCC panels, automation integration

Internal terminology mapping:
- Cold Rolling Mill = CRM / 4Hi / 6Hi Mill
- Trimming = Edge Trimmer
- Rewinding = Tension Reel / Recoiler
- Scrap = Scrap Chopper / Side Trimmer Scrap
- Color Coating = CCL / PPGI Line
- Galvanising = GI Line / Continuous Galvanizing
- Pickling = Push-Pull Pickling Line
- Skin Pass = Temper Mill
- Slitting = Slitting Line
- Electrical = MCC / PLC / Drives
- Mill Bearing = Roll Chock / Bearing Assembly

Departments and workflows:
- Mechanical Engineering, Electrical and Automation, Process Engineering, Manufacturing, Projects/EPC, Service and Revamp, Procurement, Sales and Business Development
- Typical workflow: Sales/RFQ -> Engineering/BOM -> Manufacturing -> Automation Integration -> Dispatch/Installation -> After-Sales

Engineering language commonly used:
- stand, reduction pass, coil break, tension zone
- drive tuning, synchronization, master-slave control, loop control
- AGC, AFC, elongation percentage
- cold commissioning, hot trial, line stabilization

Truthfulness rule:
- leadership and products are treated as internal business context
- exact private-company org chart details may not be publicly confirmed, so if asked for exact reporting lines or officially published org charts, answer carefully and distinguish confirmed detail from likely operating structure
`.trim();

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function normalizeBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    return tryParseJson(body) || {};
  }
  return body;
}

function clampText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim(),
    )
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: clampText(message.content, 6000),
    }));
}

function getLastUserMessage(messages) {
  const reversed = [...messages].reverse();
  return reversed.find((message) => message.role === "user") || null;
}

function buildContextText(context) {
  const lines = [SYSTEM_PROMPT, "", "Internal company knowledge:", COMPANY_PROFILE];
  if (!context || typeof context !== "object") {
    return lines.join("\n");
  }

  const pageTitle = clampText(context.pageTitle, 200);
  const pagePath = clampText(context.pagePath, 200);
  const heading = clampText(context.heading, 200);
  const subheading = clampText(context.subheading, 300);

  if (pageTitle || pagePath || heading || subheading) {
    lines.push("");
    lines.push("Current page context:");
    if (pageTitle) lines.push(`Page title: ${pageTitle}`);
    if (pagePath) lines.push(`Page path: ${pagePath}`);
    if (heading) lines.push(`Main heading: ${heading}`);
    if (subheading) lines.push(`Supporting heading: ${subheading}`);
  }

  if (context.dashboard) {
    lines.push("");
    lines.push("Live dashboard snapshot:");
    lines.push(clampText(JSON.stringify(context.dashboard), 18000));
  }

  return lines.join("\n");
}

function normalizeQuestionText(question) {
  return String(question || "")
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}

function isGreeting(text) {
  return /^(hi+|hello+|hey+|heya+|good morning|good afternoon|good evening|namaste|yo+)$/.test(text);
}

function isThanks(text) {
  return /^(thanks?|thank you|thx|great|awesome|perfect)$/.test(text);
}

function isFarewell(text) {
  return /^(bye|goodbye|see you|see ya|talk later)$/.test(text);
}

function isLikelyNoise(text) {
  if (!text) return true;
  if (text.length <= 2) return true;
  if (isGreeting(text) || isThanks(text) || isFarewell(text)) return false;
  if (text.includes(" ") || text.includes("/")) return false;
  if (/\d/.test(text)) return false;
  if (text.length > 8) return false;
  if (/(.)\1{3,}/.test(text)) return true;
  const vowels = (text.match(/[aeiou]/g) || []).length;
  const consonants = (text.match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length;
  return consonants >= 3 && vowels <= 2;
}

function getStructuredConversationReply(question) {
  const lowerQuestion = normalizeQuestionText(question);

  if (isGreeting(lowerQuestion)) {
    return "Hello. I am here and ready to help. You can ask me about the live dashboard, YOGIJI DIGI, projects, KPIs, leadership, workflows, or general questions.";
  }

  if (isThanks(lowerQuestion)) {
    return "You are welcome. If you want, I can also break down the current dashboard, compare forecast vs actuals, or answer company-specific questions.";
  }

  if (isFarewell(lowerQuestion)) {
    return "All right. If you need anything else about the dashboard or YOGIJI DIGI, I am here.";
  }

  if (isLikelyNoise(lowerQuestion)) {
    return "I did not catch that clearly. Please rephrase your question, and I will help. You can ask things like monthly assemblies, top revenue performer, project lists, leadership, or workflow details.";
  }

  return "";
}

function getStructuredCompanyReply(question) {
  const lowerQuestion = normalizeQuestionText(question);

  if (
    includesAny(lowerQuestion, [
      "where is yogiji digi",
      "head office",
      "headquarters",
      "where is the company based",
      "where are you based",
    ])
  ) {
    return "YOGIJI DIGI is based in Faridabad, Haryana, India, and operates as an industrial engineering company focused on flat steel processing and automation.";
  }

  if (
    includesAny(lowerQuestion, [
      "who is the md",
      "who is managing director",
      "who leads yogiji digi",
      "leadership",
      "directors",
      "leadership team",
    ])
  ) {
    return "The key leadership context I have for YOGIJI DIGI is: Navneet Singh Gill as Managing Director, with Satish Kumar Tripathi and Sameer Bansal as directors. Varun Jay Rana and Aseem Gill also appear in senior business and operations context.";
  }

  if (
    includesAny(lowerQuestion, [
      "what does yogiji digi do",
      "company profile",
      "about yogiji digi",
      "what kind of company",
      "what is yogiji digi",
    ])
  ) {
    return "YOGIJI DIGI is an integrated engineering and industrial machinery company positioned as a turnkey solution provider for downstream flat steel processing plants. Its work combines mechanical/process equipment with electrical and automation integration.";
  }

  if (
    includesAny(lowerQuestion, [
      "product lines",
      "products",
      "what do you manufacture",
      "what machines",
      "offerings",
    ])
  ) {
    return "YOGIJI DIGI’s core offerings include Cold Rolling Mills, Skin Pass Mills, Slitting Lines, Cut-to-Length Lines, Rewinding and Trimming systems, Color Coating Lines, Galvanizing and Galvalume lines, Pickling Lines, Acid Regeneration Plants, and automation systems such as PLC, SCADA, drives, MCC, and PCC panels.";
  }

  if (
    includesAny(lowerQuestion, [
      "departments",
      "teams",
      "functions",
      "internal departments",
    ])
  ) {
    return "A realistic YOGIJI DIGI operating structure includes Mechanical Engineering, Electrical and Automation, Process Engineering, Manufacturing, Projects/EPC, Service and Revamp, Procurement, and Sales/Business Development.";
  }

  if (
    includesAny(lowerQuestion, [
      "workflow",
      "internal workflow",
      "project workflow",
      "how does the work flow",
      "how do projects move",
    ])
  ) {
    return "A typical YOGIJI DIGI workflow is: Sales/RFQ -> technical discussion and engineering -> BOM and line design -> manufacturing and fabrication -> automation integration -> dispatch, erection, and commissioning -> after-sales support, revamp, and optimization.";
  }

  if (
    includesAny(lowerQuestion, [
      "what is crm",
      "cold rolling mill",
      "what is skin pass",
      "what is pickling",
      "what is galvanising",
      "what is galvanizing",
      "what is slitting",
      "what is rewinding",
      "what is trimming",
      "what is mill bearing",
      "what is electrical",
    ])
  ) {
    return "Internal terminology maps like this: Cold Rolling Mill = CRM / 4Hi / 6Hi Mill, Skin Pass = Temper Mill, Pickling = Push-Pull Pickling Line, Galvanising = GI Line, Slitting = Slitting Line, Rewinding = Tension Reel / Recoiler, Trimming = Edge Trimmer, Electrical = MCC / PLC / Drives, and Mill Bearing = Roll Chock / Bearing Assembly.";
  }

  return "";
}

function buildGeminiPayload(messages, context) {
  return {
    systemInstruction: {
      parts: [{ text: buildContextText(context) }],
    },
    contents: messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })),
    generationConfig: {
      temperature: 0.55,
      topP: 0.9,
      maxOutputTokens: 1024,
    },
  };
}

function buildOpenAIMessages(messages, context) {
  return [
    { role: "system", content: buildContextText(context) },
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
}

function extractGeminiReply(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function extractOpenAIReply(data) {
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function isRateLimited(clientIp) {
  const now = Date.now();
  const recentRequests = (requestLog.get(clientIp) || []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );

  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestLog.set(clientIp, recentRequests);
    return true;
  }

  recentRequests.push(now);
  requestLog.set(clientIp, recentRequests);
  return false;
}

function normalizeMonthToken(rawMonth, rawYear) {
  const monthMap = {
    jan: "Jan",
    january: "Jan",
    feb: "Feb",
    february: "Feb",
    mar: "Mar",
    march: "Mar",
    apr: "Apr",
    april: "Apr",
    may: "May",
    jun: "Jun",
    june: "Jun",
    jul: "Jul",
    july: "Jul",
    aug: "Aug",
    august: "Aug",
    sep: "Sep",
    sept: "Sep",
    september: "Sep",
    oct: "Oct",
    october: "Oct",
    nov: "Nov",
    november: "Nov",
    dec: "Dec",
    december: "Dec",
  };

  const month = monthMap[String(rawMonth || "").toLowerCase()];
  if (!month) return "";

  const yearText = String(rawYear || "").trim();
  const year = yearText.length === 2 ? yearText : yearText.slice(-2);
  if (!year) return "";

  return `${month}/${year}`;
}

function extractMonthToken(question) {
  const match = String(question || "").match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b[\s,/-]*(20\d{2}|\d{2})/i,
  );

  if (!match) return "";
  return normalizeMonthToken(match[1], match[2]);
}

function formatActiveFilters(filters, selection) {
  const parts = [];

  if (Array.isArray(filters?.months) && filters.months.length > 0) {
    parts.push(`months: ${filters.months.join(", ")}`);
  }
  if (filters?.status && filters.status !== "all") {
    parts.push(`status: ${filters.status}`);
  }
  if (selection?.pm) parts.push(`PM: ${selection.pm}`);
  if (selection?.product) parts.push(`product: ${selection.product}`);
  if (selection?.month) parts.push(`month: ${selection.month}`);

  return parts.length > 0 ? parts.join(" | ") : "no extra filters applied";
}

function getStructuredDashboardReply(question, context, messages) {
  const dashboard = context?.dashboard?.dashboard;
  if (!dashboard || typeof dashboard !== "object") {
    return "";
  }

  const lowerQuestion = normalizeQuestionText(question);
  const monthlyBreakdown = Array.isArray(dashboard.monthlyBreakdown)
    ? dashboard.monthlyBreakdown
    : [];
  const topProjectManagers = Array.isArray(dashboard.topProjectManagers)
    ? dashboard.topProjectManagers
    : [];
  const topVisibleProjects = Array.isArray(dashboard.topVisibleProjects)
    ? dashboard.topVisibleProjects
    : [];
  const visibleProjectNames = Array.isArray(dashboard.visibleProjectNames)
    ? dashboard.visibleProjectNames
    : [];
  const mode = dashboard.mode || "forecast";
  const filtersText = formatActiveFilters(dashboard.filters, dashboard.selection);
  const topLeader = topProjectManagers[0] || null;
  const recentUserMessages = Array.isArray(messages)
    ? messages
        .filter((message) => message.role === "user")
        .slice(-4)
        .map((message) => normalizeQuestionText(message.content))
    : [];
  const priorUserMessages = recentUserMessages.slice(0, -1);
  const recentTopPerformerContext = priorUserMessages.some((entry) =>
    includesAny(entry, [
      "top performer",
      "highest billing",
      "highest revenue",
      "top pm",
      "top manager",
      "best performer",
    ]),
  );
  const asksRevenue = includesAny(lowerQuestion, ["revenue", "revenye", "billing"]);
  const asksTopPerformer = includesAny(lowerQuestion, [
    "top performer",
    "best performer",
    "highest performer",
    "highest billing",
    "highest revenue",
    "top pm",
    "top manager",
    "leading pm",
    "leader in revenue",
  ]);
  const asksTopProject = includesAny(lowerQuestion, ["top project", "highest project"]);
  const asksPageSummary = includesAny(lowerQuestion, [
    "summarize this page",
    "what does this dashboard show",
    "what is on this page",
  ]);
  const asksProjectCount = includesAny(lowerQuestion, ["how many projects", "project count"]);
  const asksAverageMonthly = includesAny(lowerQuestion, ["average monthly"]);
  const isAcknowledgement = [
    "yes",
    "yes exactly",
    "exactly",
    "right",
    "correct",
  ].includes(lowerQuestion);
  const leaderNameLower = topLeader ? normalizeQuestionText(topLeader.pm) : "";

  if (lowerQuestion.includes("forecast") && lowerQuestion.includes("actual")) {
    return `Forecast is the planned view: expected billing and assemblies to be dispatched. Actuals is the realized view: billing and assemblies already dispatched. Right now the page is in ${mode} mode with ${filtersText}.`;
  }

  const monthToken = extractMonthToken(question);
  if (monthToken && lowerQuestion.includes("assembl")) {
    const monthRow = monthlyBreakdown.find(
      (row) => String(row.month).toLowerCase() === monthToken.toLowerCase(),
    );

    if (monthRow) {
      const assemblyLabel =
        mode === "forecast" ? "assemblies to be dispatched" : "assemblies dispatched";
      return `On the current ${mode} view, ${monthRow.month} shows ${monthRow.assemblies} ${assemblyLabel}. That view also covers ${monthRow.projects} projects and about Rs. ${monthRow.billingCr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr in billing. Active filters: ${filtersText}.`;
    }

    return `I do not see ${monthToken} in the current dashboard snapshot on this page. Active filters right now are: ${filtersText}.`;
  }

  if (
    lowerQuestion.includes("assemblies to be dispatched") ||
    lowerQuestion.includes("assemblies dispatched") ||
    lowerQuestion === "assemblies to be dispatched" ||
    lowerQuestion === "assemblies dispatched"
  ) {
    return `The current ${mode} view shows ${dashboard.kpis?.assemblies || "no assembly count"} on the page. Active filters: ${filtersText}.`;
  }

  if (
    topLeader &&
    (
      (asksRevenue && asksTopPerformer) ||
      lowerQuestion === "who s the top performer" ||
      lowerQuestion === "who is the top performer" ||
      lowerQuestion === "top performer in revenue" ||
      lowerQuestion === "top performer" ||
      (asksRevenue && recentTopPerformerContext) ||
      (recentTopPerformerContext && lowerQuestion === "i am talking about revenue")
    )
  ) {
    return `Based on the current ${mode} view, the top performer in revenue is ${topLeader.pm}, at about Rs. ${topLeader.billingCr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr. Active filters: ${filtersText}.`;
  }

  if (topLeader && leaderNameLower && lowerQuestion === leaderNameLower) {
    return `Yes. Based on the current ${mode} view, ${topLeader.pm} is leading revenue at about Rs. ${topLeader.billingCr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr.`;
  }

  if (topLeader && leaderNameLower && lowerQuestion === `${leaderNameLower} `) {
    return `Yes. Based on the current ${mode} view, ${topLeader.pm} is leading revenue at about Rs. ${topLeader.billingCr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr.`;
  }

  if (topLeader && isAcknowledgement && recentTopPerformerContext) {
    return `Right. On the current ${mode} view, ${topLeader.pm} is the top revenue performer at about Rs. ${topLeader.billingCr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr.`;
  }

  if (asksTopPerformer && topLeader) {
    return `On the current ${mode} view, the top performer by billing is ${topLeader.pm}, at about Rs. ${topLeader.billingCr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr. Active filters: ${filtersText}.`;
  }

  if (asksTopProject) {
    if (topVisibleProjects.length > 0) {
      const leader = topVisibleProjects[0];
      return `The top visible project right now is ${leader.name}, handled by ${leader.pm}, with about Rs. ${leader.totalBillingCr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr.`;
    }
  }

  if (
    includesAny(lowerQuestion, [
      "all project number",
      "all project numbers",
      "all project names",
      "list all projects",
      "show all projects",
    ])
  ) {
    if (visibleProjectNames.length > 0) {
      const projectList = visibleProjectNames.join(", ");
      return `I can list the currently visible projects on this ${mode} view. Total visible projects: ${visibleProjectNames.length}. Projects: ${projectList}.`;
    }

    if (dashboard.kpis?.projects) {
      return `The page currently shows ${dashboard.kpis.projects} projects, but I do not have the visible project-name list in this snapshot.`;
    }
  }

  if (lowerQuestion.includes("revenue") || lowerQuestion.includes("billing value")) {
    if (dashboard.kpis?.billing) {
      return `The page currently shows billing at ${dashboard.kpis.billing}. Active filters: ${filtersText}.`;
    }
  }

  if (asksProjectCount) {
    if (dashboard.kpis?.projects) {
      return `The page currently shows ${dashboard.kpis.projects} projects. Active filters: ${filtersText}.`;
    }
  }

  if (asksAverageMonthly) {
    if (dashboard.kpis?.averageMonthly) {
      return `The current average monthly value on this page is ${dashboard.kpis.averageMonthly}. Active filters: ${filtersText}.`;
    }
  }

  if (asksPageSummary) {
    return `This page is the ${dashboard.title || "dashboard"} for YOGIJI DIGI. It is currently showing the ${mode} view with ${dashboard.kpis?.projects || "0"} projects, billing of ${dashboard.kpis?.billing || "no billing value"}, ${dashboard.kpis?.assemblies || "no assembly count"} assemblies, and an average monthly value of ${dashboard.kpis?.averageMonthly || "no average monthly value"}. Active filters: ${filtersText}.`;
  }

  return "";
}

function humanizeProviderError(rawMessage, statusCode) {
  const message = String(rawMessage || "").toLowerCase();

  if (
    statusCode === 429 ||
    includesAny(message, [
      "quota exceeded",
      "rate limit",
      "too many requests",
      "free tier requests",
      "retry in",
    ])
  ) {
    return "The assistant is temporarily busy right now. Please wait a few seconds and try again.";
  }

  if (
    includesAny(message, [
      "high demand",
      "overloaded",
      "service unavailable",
      "currently unavailable",
      "temporarily unavailable",
    ])
  ) {
    return "The assistant is seeing heavy traffic right now. Please try again in a few seconds.";
  }

  if (includesAny(message, ["timed out", "timeout", "network", "socket hang up"])) {
    return "The assistant took too long to respond. Please try again.";
  }

  return "The assistant ran into a temporary issue. Please try again in a moment.";
}

async function requestGemini(messages, context) {
  if (!GEMINI_API_KEY) {
    throw new Error("The assistant is not configured on the server yet.");
  }

  const response = await axios.post(
    `${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    buildGeminiPayload(messages, context),
    {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
    },
  );

  return extractGeminiReply(response.data);
}

async function requestOpenAI(messages, context) {
  if (!OPENAI_API_KEY) {
    throw new Error("The assistant is not configured on the server yet.");
  }

  const response = await axios.post(
    OPENAI_URL,
    {
      model: OPENAI_MODEL,
      messages: buildOpenAIMessages(messages, context),
      temperature: 0.55,
      max_tokens: 1024,
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      timeout: 30000,
    },
  );

  return extractOpenAIReply(response.data);
}

async function requestProviderReply(messages, context) {
  if (AI_PROVIDER === "openai" && OPENAI_API_KEY) {
    return requestOpenAI(messages, context);
  }

  return requestGemini(messages, context);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
    return res.status(500).json({
      error: "Missing AI credentials",
      message: "Add an AI API key to your server environment.",
    });
  }

  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp)) {
    return res.status(429).json({
      error: "Rate limited",
      message: "Too many chat requests. Please wait a minute and try again.",
    });
  }

  const body = normalizeBody(req.body);
  const messages = normalizeMessages(body.messages);
  const context = body.context && typeof body.context === "object" ? body.context : {};

  if (messages.length === 0) {
    return res.status(400).json({
      error: "Missing messages",
      message: "Send at least one user message to /api/chat.",
    });
  }

  const lastUserMessage = getLastUserMessage(messages);
  const conversationReply = getStructuredConversationReply(lastUserMessage?.content || "");
  if (conversationReply) {
    return res.status(200).json({
      reply: conversationReply,
      source: "structured-conversation",
    });
  }

  const companyReply = getStructuredCompanyReply(lastUserMessage?.content || "");
  if (companyReply) {
    return res.status(200).json({
      reply: companyReply,
      source: "structured-company",
    });
  }

  const structuredReply = getStructuredDashboardReply(lastUserMessage?.content || "", context, messages);
  if (structuredReply) {
    return res.status(200).json({
      reply: structuredReply,
      source: "structured-context",
    });
  }

  try {
    const reply = await requestProviderReply(messages, context);

    if (!reply) {
      return res.status(502).json({
        error: "Empty assistant response",
        message: "The assistant returned an empty answer.",
      });
    }

    return res.status(200).json({
      reply,
      source: AI_PROVIDER,
    });
  } catch (error) {
    const statusCode = error.response?.status || 500;
    const apiMessage =
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      error.message ||
      "Unknown assistant error";

    console.error("Chat provider error:", apiMessage);

    return res.status(statusCode).json({
      error: "Assistant request failed",
      message: humanizeProviderError(apiMessage, statusCode),
    });
  }
};
