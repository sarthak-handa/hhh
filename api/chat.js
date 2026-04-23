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
  const lines = [SYSTEM_PROMPT];
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

function getStructuredDashboardReply(question, context) {
  const dashboard = context?.dashboard?.dashboard;
  if (!dashboard || typeof dashboard !== "object") {
    return "";
  }

  const lowerQuestion = String(question || "").toLowerCase();
  const monthlyBreakdown = Array.isArray(dashboard.monthlyBreakdown)
    ? dashboard.monthlyBreakdown
    : [];
  const topProjectManagers = Array.isArray(dashboard.topProjectManagers)
    ? dashboard.topProjectManagers
    : [];
  const topVisibleProjects = Array.isArray(dashboard.topVisibleProjects)
    ? dashboard.topVisibleProjects
    : [];
  const mode = dashboard.mode || "forecast";
  const filtersText = formatActiveFilters(dashboard.filters, dashboard.selection);

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

  if (lowerQuestion.includes("highest billing pm") || lowerQuestion.includes("top pm")) {
    if (topProjectManagers.length > 0) {
      const leader = topProjectManagers[0];
      return `The highest visible PM by billing on this page is ${leader.pm}, at about Rs. ${leader.billingCr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr. Active filters: ${filtersText}.`;
    }
  }

  if (lowerQuestion.includes("top project") || lowerQuestion.includes("highest project")) {
    if (topVisibleProjects.length > 0) {
      const leader = topVisibleProjects[0];
      return `The top visible project right now is ${leader.name}, handled by ${leader.pm}, with about Rs. ${leader.totalBillingCr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr.`;
    }
  }

  if (lowerQuestion.includes("revenue") || lowerQuestion.includes("billing value")) {
    if (dashboard.kpis?.billing) {
      return `The page currently shows billing at ${dashboard.kpis.billing}. Active filters: ${filtersText}.`;
    }
  }

  if (lowerQuestion.includes("how many projects") || lowerQuestion.includes("project count")) {
    if (dashboard.kpis?.projects) {
      return `The page currently shows ${dashboard.kpis.projects} projects. Active filters: ${filtersText}.`;
    }
  }

  if (lowerQuestion.includes("average monthly")) {
    if (dashboard.kpis?.averageMonthly) {
      return `The current average monthly value on this page is ${dashboard.kpis.averageMonthly}. Active filters: ${filtersText}.`;
    }
  }

  if (
    lowerQuestion.includes("summarize this page") ||
    lowerQuestion.includes("what does this dashboard show") ||
    lowerQuestion.includes("what is on this page")
  ) {
    return `This page is the ${dashboard.title || "dashboard"} for YOGIJI DIGI. It is currently showing the ${mode} view with ${dashboard.kpis?.projects || "0"} projects, ${dashboard.kpis?.billing || "no billing value"}, ${dashboard.kpis?.assemblies || "no assembly count"}, and ${dashboard.kpis?.averageMonthly || "no average monthly value"}. Active filters: ${filtersText}.`;
  }

  return "";
}

async function requestGemini(messages, context) {
  if (!GEMINI_API_KEY) {
    throw new Error("The assistant is not configured for Gemini yet.");
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
    throw new Error("The assistant is not configured for OpenAI yet.");
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
      message: "Add GEMINI_API_KEY or OPENAI_API_KEY to your server environment.",
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
  const structuredReply = getStructuredDashboardReply(lastUserMessage?.content || "", context);
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
      message: apiMessage,
    });
  }
};
