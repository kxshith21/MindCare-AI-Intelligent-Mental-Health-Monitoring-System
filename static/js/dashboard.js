/**
 * Premium analytics dashboard — Chart.js + dynamic sections
 */
(function () {
    const COLORS = {
        sadness: "#60a5fa",
        joy: "#2dd4bf",
        fear: "#a78bfa",
        anger: "#fb7185",
        neutral: "#94a3b8",
    };
    const FONT = "'Plus Jakarta Sans', 'DM Sans', sans-serif";

    let trendChart, pieChart, riskChart, moodChart;

    function getColor(e) {
        return COLORS[e] || "#94a3b8";
    }

    function buildTrendData(weekly) {
        const days = [...new Set((weekly || []).map((r) => r.day))].sort();
        const emotions = ["sadness", "joy", "fear", "anger", "neutral"];
        return {
            labels: days,
            datasets: emotions.map((emotion) => ({
                label: emotion.charAt(0).toUpperCase() + emotion.slice(1),
                data: days.map((day) => {
                    const row = weekly.find((r) => r.day === day && r.detected_emotion === emotion);
                    return row ? row.count : 0;
                }),
                borderColor: getColor(emotion),
                backgroundColor: getColor(emotion) + "22",
                tension: 0.4,
                fill: true,
            })),
        };
    }

    function chartDefaults() {
        return {
            responsive: true,
            plugins: {
                legend: {
                    labels: { font: { family: FONT, size: 11 }, usePointStyle: true, padding: 16 },
                },
            },
        };
    }

    function renderTrend(weekly) {
        const ctx = document.getElementById("emotionTrendChart");
        if (!ctx) return;
        const { labels, datasets } = buildTrendData(weekly);
        if (trendChart) trendChart.destroy();
        trendChart = new Chart(ctx, {
            type: "line",
            data: { labels, datasets },
            options: {
                ...chartDefaults(),
                scales: {
                    y: { beginAtZero: true, grid: { color: "rgba(37,99,235,0.06)" } },
                    x: { grid: { display: false } },
                },
            },
        });
    }

    function renderPie(dist) {
        const ctx = document.getElementById("emotionPieChart");
        if (!ctx) return;
        const labels = (dist || []).map((d) => d.detected_emotion);
        const data = (dist || []).map((d) => d.count);
        if (pieChart) pieChart.destroy();
        pieChart = new Chart(ctx, {
            type: "doughnut",
            data: {
                labels,
                datasets: [{ data, backgroundColor: labels.map(getColor), borderWidth: 0, hoverOffset: 10 }],
            },
            options: { ...chartDefaults(), cutout: "68%" },
        });
    }

    function renderRisk(timeline) {
        const ctx = document.getElementById("riskTimelineChart");
        if (!ctx) return;
        const sorted = [...(timeline || [])].reverse();
        if (riskChart) riskChart.destroy();
        riskChart = new Chart(ctx, {
            type: "line",
            data: {
                labels: sorted.map((r) => r.day),
                datasets: [{
                    label: "Avg risk %",
                    data: sorted.map((r) => Math.round((r.avg_risk || 0) * 100)),
                    borderColor: "#f472b6",
                    backgroundColor: "rgba(244, 114, 182, 0.15)",
                    fill: true,
                    tension: 0.35,
                }],
            },
            options: {
                ...chartDefaults(),
                scales: { y: { beginAtZero: true, max: 100, grid: { color: "rgba(0,0,0,0.04)" } } },
            },
        });
    }

    function renderMood(timeline) {
        const ctx = document.getElementById("moodChart");
        if (!ctx) return;
        const sorted = [...(timeline || [])].reverse();
        const moodScores = sorted.map((r) => {
            const risk = r.avg_risk || 0;
            return Math.max(0, Math.min(100, Math.round(100 - risk * 100)));
        });
        if (moodChart) moodChart.destroy();
        moodChart = new Chart(ctx, {
            type: "line",
            data: {
                labels: sorted.map((r) => r.day),
                datasets: [{
                    label: "Mood wellness",
                    data: moodScores,
                    borderColor: "#14b8a6",
                    backgroundColor: "rgba(20, 184, 166, 0.15)",
                    fill: true,
                    tension: 0.4,
                }],
            },
            options: {
                ...chartDefaults(),
                scales: { y: { beginAtZero: true, max: 100 } },
            },
        });
    }

    function updateMetrics(data) {
        const t = data.totals || {};
        const wellness = data.wellness_score ?? 75;

        setText("statTotal", t.total_messages ?? 0);
        setText("statEmergency", t.emergency_count ?? 0);
        setText("statDominant", data.dominant_emotion || "—");
        setText("wellnessScore", wellness);
        setText("wellnessScoreRing", wellness);

        document.querySelectorAll(".wellness-ring-lg").forEach((el) => {
            el.style.setProperty("--score", wellness);
        });
    }

    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function renderHistory(rows) {
        const grid = document.getElementById("historyGrid");
        if (!grid) return;

        if (!rows?.length) {
            grid.innerHTML = `
                <div class="empty-panel glass-panel col-12">
                    <i class="bi bi-chat-square-text"></i>
                    <p>No conversations yet. <a href="/chat">Start chatting</a></p>
                </div>`;
            return;
        }

        grid.innerHTML = rows
            .map((c) => {
                const risk = Math.round((c.suicide_risk_score || 0) * 100);
                const flag = c.emergency_flag ? '<span class="flag-alert">Flagged</span>' : "";
                return `
                <article class="history-card glass-panel">
                    <div class="history-card-head">
                        <span class="emotion-badge emotion-${c.detected_emotion}">${c.detected_emotion}</span>
                        <time>${(c.timestamp || "").slice(0, 16)}</time>
                    </div>
                    <p class="history-user">"${escapeHtml(truncate(c.user_message, 100))}"</p>
                    <p class="history-bot">${escapeHtml(truncate(c.bot_response, 120))}</p>
                    <div class="history-foot"><span>Risk ${risk}%</span>${flag}</div>
                </article>`;
            })
            .join("");
    }

    function renderAlerts(alerts) {
        const container = document.getElementById("alertsContainer");
        if (!container) return;

        if (!alerts?.length) {
            container.innerHTML = `
                <div class="empty-panel glass-panel">
                    <i class="bi bi-shield-check"></i>
                    <p>No high-risk alerts. That's a good sign.</p>
                </div>`;
            return;
        }

        container.innerHTML = alerts
            .map(
                (a) => `
            <div class="alert-card glass-panel">
                <div class="alert-card-top">
                    <span class="alert-level">High risk</span>
                    <span class="alert-time">${(a.timestamp || "").slice(0, 16)}</span>
                </div>
                <p class="alert-msg">${escapeHtml(truncate(a.user_message, 120))}</p>
                <div class="alert-score">Risk: ${Math.round((a.suicide_risk_score || 0) * 100)}%</div>
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

    async function loadAnalytics() {
        try {
            const res = await fetch("/analytics");
            const data = await res.json();
            updateMetrics(data);
            renderTrend(data.weekly_emotions);
            renderPie(data.emotion_distribution);
            renderRisk(data.risk_timeline);
            renderMood(data.risk_timeline);
            renderHistory(data.recent_conversations);
            renderAlerts(data.emergency_alerts);
            return data;
        } catch (err) {
            console.error("Dashboard load failed:", err);
        }
    }

    window.loadAnalytics = loadAnalytics;

    document.getElementById("refreshLogs")?.addEventListener("click", loadAnalytics);
    if (document.getElementById("emotionTrendChart") || document.getElementById("emotionPieChart")) {
        loadAnalytics();
    }
})();
