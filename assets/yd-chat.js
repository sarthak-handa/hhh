(function () {
  const ROOT_ID = "ydc-root";
  const STORAGE_KEY = "yd_insights_chat_history_v2";
  const MAX_MESSAGES = 20;
  const MAX_CONTEXT_MESSAGES = 12;
  const ASSISTANT_NAME = "YD Insights";
  const PANEL_TITLE = "YD Insights Copilot";
  const PANEL_SUBTITLE = "Live website and business assistant";
  const SUGGESTIONS = [
    "What does this dashboard show?",
    "How many assemblies are in Apr/26?",
    "Who is the top performer in revenue?",
    "Who are YOGIJI DIGI leadership?",
  ];
  const INITIAL_MESSAGE =
    "Hello. I am YD Insights Copilot. I can answer questions about YOGIJI DIGI, leadership, products, workflows, live dashboard numbers, projects, KPIs, filters, and general topics.";

  const state = {
    initialized: false,
    open: false,
    loading: false,
    messages: [],
    refs: {},
    currentSuggestions: [...SUGGESTIONS],
  };

  function safeJsonParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  function cloneJsonSafe(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return null;
    }
  }

  function formatTime(isoString) {
    const date = isoString ? new Date(isoString) : new Date();
    return new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  }

  function getFallbackDashboardContext() {
    return {
      title: document.querySelector("h1")?.textContent?.trim() || "",
      activeMode:
        document.getElementById("toggle-forecast")?.className?.includes("bg-yogi-red") ||
        document.getElementById("toggle-forecast")?.className?.includes("bg-rose-500")
          ? "forecast"
          : "actuals",
      kpis: {
        projects: document.getElementById("kpi-projects")?.innerText || "",
        revenue: document.getElementById("kpi-revenue")?.innerText || "",
        assemblies: document.getElementById("kpi-assemblies")?.innerText || "",
        averageMonthly: document.getElementById("kpi-avg")?.innerText || "",
      },
      currentFilters: {
        months: window.state?.filters?.month || [],
        status: window.state?.filters?.status || "all",
      }
    };
  }

  function getContext() {
    const firstHeading = document.querySelector("h1");
    const subHeading = document.querySelector("h2, .section-title h2, .hero p");
    const pageSnapshot = cloneJsonSafe(window.__YD_AI_CONTEXT__ || getFallbackDashboardContext());

    return {
      pageTitle: document.title || "",
      pagePath: window.location.pathname || "/",
      heading: firstHeading ? firstHeading.textContent.trim() : "",
      subheading: subHeading ? subHeading.textContent.trim() : "",
      dashboard: pageSnapshot,
    };
  }

  function saveMessages() {
    const compactMessages = state.messages
      .slice(-MAX_MESSAGES)
      .map((message) => ({
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      }));

    localStorage.setItem(STORAGE_KEY, JSON.stringify(compactMessages));
  }

  function loadMessages() {
    const stored = safeJsonParse(localStorage.getItem(STORAGE_KEY), []);
    if (!Array.isArray(stored)) {
      return [];
    }

    return stored
      .filter(
        (message) =>
          message &&
          (message.role === "assistant" || message.role === "user") &&
          typeof message.content === "string" &&
          message.content.trim(),
      )
      .slice(-MAX_MESSAGES);
  }

  function createMessageNode(message) {
    const wrapper = document.createElement("div");
    wrapper.className = `ydc-message ydc-message--${message.role}`;

    const card = document.createElement("div");
    const bubble = document.createElement("div");
    bubble.className = "ydc-bubble";
    
    // Check if content is JSON for a card
    if (message.role === "assistant" && message.content.startsWith("{") && message.content.endsWith("}")) {
      try {
        const data = JSON.parse(message.content);
        if (data.type === "kpi_card") {
          bubble.innerHTML = `
            <div class="ydc-data-card">
              <div class="ydc-card-title">${data.title}</div>
              <div class="ydc-card-value">${data.value}</div>
              ${data.subtitle ? `<div class="ydc-card-subtitle">${data.subtitle}</div>` : ""}
              ${data.action ? `<button onclick="${data.action.code}" class="ydc-card-action">${data.action.label}</button>` : ""}
            </div>
          `;
        } else {
          bubble.textContent = message.content;
        }
      } catch (e) {
        bubble.textContent = message.content;
      }
    } else {
      bubble.textContent = message.content;
    }

    const meta = document.createElement("div");
    meta.className = "ydc-meta";
    meta.textContent =
      message.role === "assistant"
        ? `${ASSISTANT_NAME} - ${formatTime(message.createdAt)}`
        : formatTime(message.createdAt);

    card.appendChild(bubble);
    card.appendChild(meta);
    wrapper.appendChild(card);

    return wrapper;
  }

  function renderMessages() {
    const messagesHost = state.refs.messages;
    if (!messagesHost) return;

    messagesHost.innerHTML = "";
    state.messages.forEach((message) => {
      messagesHost.appendChild(createMessageNode(message));
    });
    scrollMessagesToBottom();
  }

  function scrollMessagesToBottom() {
    const messagesHost = state.refs.messages;
    if (!messagesHost) return;

    window.requestAnimationFrame(() => {
      messagesHost.scrollTop = messagesHost.scrollHeight;
    });
  }

  function setOpenState(isOpen) {
    state.open = isOpen;
    if (state.refs.root) {
      state.refs.root.classList.toggle("ydc-open", isOpen);
    }

    if (state.refs.launcher) {
      state.refs.launcher.setAttribute("aria-expanded", isOpen ? "true" : "false");
      state.refs.launcher.setAttribute(
        "aria-label",
        isOpen ? `Close ${PANEL_TITLE}` : `Open ${PANEL_TITLE}`,
      );
    }

    if (isOpen && state.refs.textarea) {
      state.refs.textarea.focus();
      scrollMessagesToBottom();
    }
  }

  function autoResizeTextarea() {
    const textarea = state.refs.textarea;
    if (!textarea) return;

    textarea.style.height = "24px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  }

  function setComposerLoading(isLoading) {
    state.loading = isLoading;
    if (state.refs.send) {
      state.refs.send.disabled = isLoading;
    }
    if (state.refs.textarea) {
      state.refs.textarea.setAttribute("aria-busy", isLoading ? "true" : "false");
    }
  }

  function showTypingIndicator() {
    if (!state.refs.messages || state.refs.typing) return;

    const wrapper = document.createElement("div");
    wrapper.className = "ydc-message ydc-message--assistant";
    wrapper.innerHTML =
      `<div><div class="ydc-bubble"><div class="ydc-typing"><span></span><span></span><span></span></div></div><div class="ydc-meta">${ASSISTANT_NAME} is thinking...</div></div>`;

    state.refs.typing = wrapper;
    state.refs.messages.appendChild(wrapper);
    scrollMessagesToBottom();
  }

  function hideTypingIndicator() {
    if (!state.refs.typing) return;

    state.refs.typing.remove();
    state.refs.typing = null;
  }

  function pushMessage(role, content) {
    state.messages.push({
      role,
      content,
      createdAt: new Date().toISOString(),
    });
    state.messages = state.messages.slice(-MAX_MESSAGES);
    saveMessages();
    renderMessages();
  }

  async function requestAssistantReply() {
    const payload = {
      messages: state.messages.slice(-MAX_CONTEXT_MESSAGES).map((message) => ({
        role: message.role,
        content: message.content,
      })),
      context: getContext(),
    };

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || data.error || "The assistant did not respond correctly.");
    }

    if (data.suggestions && Array.isArray(data.suggestions)) {
      state.currentSuggestions = data.suggestions;
      renderSuggestions();
    }

    return data.reply.trim();
  }

  function renderSuggestions() {
    const container = state.refs.suggestionsContainer;
    if (!container) return;
    
    container.innerHTML = state.currentSuggestions.map(
      (suggestion) => `
        <button type="button" class="ydc-suggestion" data-ydc-suggestion data-prompt="${suggestion}">
          ${suggestion}
        </button>
      `
    ).join("");
    
    // Re-bind click events
    state.refs.suggestions = Array.from(container.querySelectorAll("[data-ydc-suggestion]"));
    state.refs.suggestions.forEach((button) => {
      button.onclick = () => submitPrompt(button.dataset.prompt || button.textContent || "");
    });
  }

  async function submitPrompt(promptText) {
    const trimmedPrompt = promptText.trim();
    if (!trimmedPrompt || state.loading) return;

    if (!state.open) {
      setOpenState(true);
    }

    pushMessage("user", trimmedPrompt);
    if (state.refs.textarea) {
      state.refs.textarea.value = "";
      autoResizeTextarea();
    }

    setComposerLoading(true);
    showTypingIndicator();

    try {
      const reply = await requestAssistantReply();
      hideTypingIndicator();
      pushMessage("assistant", reply);
    } catch (error) {
      hideTypingIndicator();
      pushMessage("assistant", error.message || "The assistant ran into a temporary issue. Please try again in a moment.");
    } finally {
      setComposerLoading(false);
    }
  }

  function clearConversation() {
    const confirmed = window.confirm("Clear the chat history on this browser?");
    if (!confirmed) return;

    state.messages = [];
    localStorage.removeItem(STORAGE_KEY);
    state.messages.push({
      role: "assistant",
      content: INITIAL_MESSAGE,
      createdAt: new Date().toISOString(),
    });
    saveMessages();
    renderMessages();
  }

  function bindEvents() {
    const { launcher, close, clear, form, textarea, suggestions } = state.refs;

    launcher.addEventListener("click", () => {
      setOpenState(!state.open);
    });

    close.addEventListener("click", () => {
      setOpenState(false);
    });

    clear.addEventListener("click", clearConversation);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitPrompt(textarea.value);
    });

    textarea.addEventListener("input", autoResizeTextarea);
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitPrompt(textarea.value);
      }
    });

    suggestions.forEach((button) => {
      button.addEventListener("click", () => {
        submitPrompt(button.dataset.prompt || button.textContent || "");
      });
    });
  }

  function cacheRefs(root) {
    state.refs = {
      root,
      launcher: root.querySelector("[data-ydc-launcher]"),
      close: root.querySelector("[data-ydc-close]"),
      clear: root.querySelector("[data-ydc-clear]"),
      form: root.querySelector("[data-ydc-form]"),
      textarea: root.querySelector("[data-ydc-textarea]"),
      send: root.querySelector("[data-ydc-send]"),
      messages: root.querySelector("[data-ydc-messages]"),
      suggestionsContainer: root.querySelector("[data-ydc-suggestions-container]"),
      suggestions: [],
      typing: null,
    };
  }

  function buildWidget() {
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "ydc-root";

    root.innerHTML = `
      <button
        type="button"
        class="ydc-launcher"
        data-ydc-launcher
        aria-expanded="false"
        aria-label="Open ${PANEL_TITLE}"
      >
        <i class="fa-solid fa-comments ydc-launcher-icon-open" aria-hidden="true"></i>
        <i class="fa-solid fa-xmark ydc-launcher-icon-close" aria-hidden="true"></i>
      </button>

      <section class="ydc-panel" aria-label="${PANEL_TITLE}">
        <header class="ydc-header">
          <div class="ydc-header-main">
            <div class="ydc-avatar" aria-hidden="true">
              <i class="fa-solid fa-sparkles"></i>
            </div>
            <div class="ydc-header-copy">
              <p class="ydc-title">${PANEL_TITLE}</p>
              <p class="ydc-subtitle">${PANEL_SUBTITLE}</p>
            </div>
          </div>

          <div class="ydc-actions">
            <button type="button" class="ydc-icon-btn ydc-clear" data-ydc-clear aria-label="Clear chat">
              <i class="fa-solid fa-trash"></i>
            </button>
            <button type="button" class="ydc-icon-btn ydc-close" data-ydc-close aria-label="Close chat">
              <i class="fa-solid fa-minus"></i>
            </button>
          </div>
        </header>

        <div class="ydc-body">
          <div class="ydc-suggestions" data-ydc-suggestions-container>
            <!-- Suggestions will be rendered here -->
          </div>

          <div class="ydc-messages" data-ydc-messages></div>
        </div>

        <footer class="ydc-footer">
          <form class="ydc-form" data-ydc-form>
            <div class="ydc-input-wrap">
              <textarea
                class="ydc-textarea"
                data-ydc-textarea
                rows="1"
                placeholder="Ask anything..."
              ></textarea>
              <button type="submit" class="ydc-send" data-ydc-send aria-label="Send message">
                <i class="fa-solid fa-paper-plane"></i>
              </button>
            </div>
            <p class="ydc-footnote">Live answers use the current page data whenever it is available.</p>
          </form>
        </footer>
      </section>
    `;

    return root;
  }

  function initialize() {
    if (state.initialized || !document.body || document.getElementById(ROOT_ID)) {
      return;
    }

    const root = buildWidget();
    document.body.appendChild(root);
    cacheRefs(root);
    bindEvents();

    state.messages = loadMessages();
    if (state.messages.length === 0) {
      state.messages.push({
        role: "assistant",
        content: INITIAL_MESSAGE,
        createdAt: new Date().toISOString(),
      });
    saveMessages();
    }

    renderSuggestions();
    renderMessages();
    autoResizeTextarea();
    state.initialized = true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
