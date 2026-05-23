/**
 * App shell — sidebar, section navigation, scroll reveals
 */
(function () {
    const sidebar = document.getElementById("appSidebar");
    const toggle = document.getElementById("sidebarToggle");

    toggle?.addEventListener("click", () => sidebar?.classList.toggle("open"));

    document.querySelectorAll(".sidebar-link[href*='#']").forEach((link) => {
        link.addEventListener("click", () => {
            if (window.innerWidth < 992) sidebar?.classList.remove("open");
        });
    });

    function setActiveFromHash() {
        const hash = window.location.hash || "#overview";
        document.querySelectorAll(".sidebar-link").forEach((a) => a.classList.remove("active"));
        const map = {
            "#overview": "dashboard",
            "#analytics": "analytics",
            "#alerts": "alerts",
            "#history": "history",
        };
        const key = map[hash];
        if (!key) return;
        document.querySelectorAll(".sidebar-link").forEach((a) => {
            const href = a.getAttribute("href") || "";
            if (key === "dashboard" && href.includes("#overview")) a.classList.add("active");
            else if (href.endsWith(hash)) a.classList.add("active");
        });
    }

    if (window.location.pathname.includes("dashboard")) {
        setActiveFromHash();
        window.addEventListener("hashchange", setActiveFromHash);
    }

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting) e.target.classList.add("visible");
            });
        },
        { threshold: 0.08 }
    );
    document.querySelectorAll(".reveal, .fade-in").forEach((el) => observer.observe(el));
})();
