const axios = require("axios");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 12;
const requestLog = new Map();

const SYSTEM_PROMPT = `
You are YD AI Assistant for YOGIJI DIGI websites.

Your job:
- answer general questions helpfully like a strong website AI assistant
- help users understand the current page and dashboard when page context is provided
- help with business, writing, coding, research, and productivity questions
- be clear, practical, and accurate

Rules:
- if the user asks about the current page, rely on the provided page context
- if you do not know a fact, say so instead of inventing it
- do not claim to have clicked buttons, read hidden files, or performed actions you cannot actually do
- keep answers readable and polished
- use bullets only when they genuinely help
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
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: clampText(message.content, 6000) }],
    }));
}

function buildSystemInstruction(context) {
  const lines = [SYSTEM_PROMPT];

  if (context && typeof context === "object") {
    const contextLines = [];
    const pageTitle = clampText(context.pageTitle, 200);
    const pagePath = clampText(context.pagePath, 200);
    const heading = clampText(context.heading, 200);
    const subheading = clampText(context.subheading, 300);

    if (pageTitle) contextLines.push(`Page title: ${pageTitle}`);
    if (pagePath) contextLines.push(`Page path: ${pagePath}`);
    if (heading) contextLines.push(`Main heading: ${heading}`);
    if (subheading) contextLines.push(`Supporting heading: ${subheading}`);

    if (contextLines.length > 0) {
      lines.push("Current page context:");
      lines.push(...contextLines);
    }
  }

  return {
    parts: [{ text: lines.join("\n") }],
  };
}

function extractReply(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
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

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({
      error: "Missing GEMINI_API_KEY",
      message: "Set GEMINI_API_KEY in your server environment before using the chatbot.",
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
  const contents = normalizeMessages(body.messages);

  if (contents.length === 0) {
    return res.status(400).json({
      error: "Missing messages",
      message: "Send at least one user message to /api/chat.",
    });
  }

  const payload = {
    systemInstruction: buildSystemInstruction(body.context),
    contents,
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 1024,
    },
  };

  try {
    const geminiResponse = await axios.post(
      `${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    const reply = extractReply(geminiResponse.data);

    if (!reply) {
      return res.status(502).json({
        error: "Empty Gemini response",
        message: "Gemini returned an empty answer.",
      });
    }

    return res.status(200).json({
      reply,
      model: GEMINI_MODEL,
    });
  } catch (error) {
    const statusCode = error.response?.status || 500;
    const apiMessage =
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      error.message ||
      "Unknown Gemini error";

    console.error("Gemini chat error:", apiMessage);

    return res.status(statusCode).json({
      error: "Gemini request failed",
      message: apiMessage,
    });
  }
};
