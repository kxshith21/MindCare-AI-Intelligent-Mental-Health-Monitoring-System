/**
 * Premium AI chat — typing animation, emotion badges, smooth UX
 */
(function () {
    const chatForm = document.getElementById("chatForm");
    const userInput = document.getElementById("userInput");
    const chatMessages = document.getElementById("chatMessages");
    const sendBtn = document.getElementById("sendBtn");
    const sendIcon = document.getElementById("sendIcon");
    const sendSpinner = document.getElementById("sendSpinner");
    const typingIndicator = document.getElementById("typingIndicator");
    const riskAlertPanel = document.getElementById("riskAlertPanel");
    const quickPrompts = document.getElementById("quickPrompts");

    const EMOTION_EMOJI = {
        sadness: "💙",
        joy: "✨",
        fear: "🌙",
        anger: "🔥",
        neutral: "💬",
    };

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function formatTime() {
        return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function stripDisclaimer(text) {
        if (!text) return text;
        return text
            .replace(
                /\s*[—\-–]\s*\(?\s*This chatbot is not a replacement for professional mental healthcare\.?\s*\)?/gi,
                ""
            )
            .replace(
                /\s*\(?\s*This chatbot is not a replacement for professional mental healthcare\.?\s*\)?/gi,
                ""
            )
            .trim();
    }

    function appendMessage(text, role, emotion) {
        const isUser = role === "user";
        const row = document.createElement("div");
        row.className = `msg-row ${isUser ? "user" : "ai"} fade-in`;

        let emotionHtml = "";
        if (emotion && !isUser) {
            const emoji = EMOTION_EMOJI[emotion] || "💬";
            emotionHtml = `<span class="emotion-tag emotion-${emotion}">${emoji} ${emotion}</span>`;
        }

        row.innerHTML = `
            <div class="msg-avatar ${isUser ? "user" : "ai"}"><i class="bi bi-${isUser ? "person-fill" : "robot"}"></i></div>
            <div class="msg-block">
                <div class="msg-bubble ${isUser ? "user" : "ai"}">${escapeHtml(text)}</div>
                <div class="msg-meta">
                    <span>${isUser ? "You" : "MindCare"}</span> · ${formatTime()}
                    ${emotionHtml}
                </div>
            </div>
        `;
        chatMessages.appendChild(row);
        scrollToBottom();
    }

    function setLoading(loading) {
        sendBtn.disabled = loading;
        userInput.disabled = loading;
        sendIcon.classList.toggle("d-none", loading);
        sendSpinner.classList.toggle("d-none", !loading);
        typingIndicator.classList.toggle("d-none", !loading);
        if (loading) scrollToBottom();
    }

    /** Simulate natural typing delay based on message length */
    function typingDelay(text) {
        const base = 600;
        const perChar = Math.min(text.length * 8, 1200);
        return base + perChar;
    }

    async function sendMessage(message) {
        appendMessage(message, "user");
        setLoading(true);

        const start = Date.now();

        try {
            const res = await fetch("/predict", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message }),
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Request failed");

            const reply = stripDisclaimer(data.bot_response);
            const emotion = data.detected_emotion || "neutral";
            const elapsed = Date.now() - start;
            const wait = Math.max(0, typingDelay(reply) - elapsed);
            await new Promise((r) => setTimeout(r, wait));

            appendMessage(reply, "ai", emotion);

            if (data.emergency && riskAlertPanel) {
                riskAlertPanel.classList.remove("d-none");
                riskAlertPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }

            window.dispatchEvent(new CustomEvent("mindcare:message-sent", { detail: data }));
            if (typeof window.refreshWorkspaceInsights === "function") {
                window.refreshWorkspaceInsights();
            }
        } catch (err) {
            appendMessage(
                "I'm having a little trouble connecting. Please try again in a moment.",
                "ai"
            );
            console.error(err);
        } finally {
            setLoading(false);
            userInput.focus();
        }
    }

    chatForm?.addEventListener("submit", (e) => {
        e.preventDefault();
        const message = userInput.value.trim();
        if (!message) return;
        userInput.value = "";
        sendMessage(message);
    });

    quickPrompts?.addEventListener("click", (e) => {
        const chip = e.target.closest(".suggestion-chip");
        if (!chip) return;
        const prompt = chip.getAttribute("data-prompt");
        if (prompt) sendMessage(prompt);
    });

    userInput?.focus();
})();
