/**
 * Integrated workspace — mobile tabs, live insights refresh after chat
 */
(function () {
    const tabs = document.querySelectorAll(".workspace-tab");
    const chatCol = document.getElementById("panelChat");
    const insightsCol = document.getElementById("panelInsights");

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            const panel = tab.getAttribute("data-panel");
            tabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            if (panel === "chat") {
                chatCol?.classList.add("active");
                insightsCol?.classList.remove("active");
            } else {
                chatCol?.classList.remove("active");
                insightsCol?.classList.add("active");
            }
        });
    });

    function renderInsightsRecent(rows) {
        const list = document.getElementById("insightsRecentList");
        if (!list) return;
        if (!rows?.length) {
            list.innerHTML = '<p class="text-muted small mb-0">Start chatting to see history.</p>';
            return;
        }
        list.innerHTML = rows
            .slice(0, 5)
            .map(
                (c) => `
            <div class="insight-recent-item">
                <span class="emotion-badge emotion-${c.detected_emotion}">${c.detected_emotion}</span>
                <p>${escapeHtml(truncate(c.user_message, 50))}</p>
            </div>`
            )
            .join("");
    }

    function truncate(s, n) {
        if (!s) return "";
        return s.length > n ? s.slice(0, n) + "..." : s;
    }

    function escapeHtml(str) {
        const d = document.createElement("div");
        d.textContent = str;
        return d.innerHTML;
    }

    async function refreshInsights() {
        if (typeof window.loadAnalytics === "function") {
            await window.loadAnalytics();
        }
        try {
            const res = await fetch("/analytics");
            const data = await res.json();
            renderInsightsRecent(data.recent_conversations);
            document.querySelectorAll(".wellness-ring-compact").forEach((el) => {
                el.style.setProperty("--score", data.wellness_score ?? 75);
            });
        } catch (e) {
            console.warn("Insights refresh:", e);
        }
    }

    window.refreshWorkspaceInsights = refreshInsights;

    window.addEventListener("mindcare:message-sent", () => {
        setTimeout(refreshInsights, 400);
    });

    document.querySelectorAll('.sidebar-link[href*="#"]').forEach((link) => {
        link.addEventListener("click", () => {
            if (window.innerWidth < 1200) {
                document.getElementById("appSidebar")?.classList.remove("open");
            }
        });
    });
})();
