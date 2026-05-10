/**
 * MT° — Welcome screen logic
 * --------------------------
 * Why a tiny separate script?
 *   The chat page loads script.js (large). The splash only needs:
 *   language toggle, skip memory, and navigation to /chat.
 */

(function () {
    "use strict";

    const STORAGE_SKIP = "mt_skip_welcome";
    const STORAGE_LANG = "mt_lang";

    const I18N = {
        en: {
            hero1: "Your health",
            hero2: "made",
            hero3: "simple",
            subtitle: "Talk to MT, your AI medical assistant",
            infoShort: "General wellness info only — not a substitute for a doctor.",
            skip: "Skip",
        },
        ar: {
            hero1: "صحتك",
            hero2: "صارت",
            hero3: "أبسط",
            subtitle: "احكي مع MT، مساعدك الطبي الذكي",
            infoShort: "معلومات عامة عن الصحة فقط — مو بديل عن الدكتور.",
            skip: "تخطي",
        },
    };

    function getLang() {
        const s = localStorage.getItem(STORAGE_LANG);
        if (s === "ar" || s === "en") return s;
        return (navigator.language || "en").toLowerCase().startsWith("ar") ? "ar" : "en";
    }

    let lang = getLang();

    function applyWelcomeLang() {
        const t = I18N[lang];
        document.documentElement.setAttribute("lang", lang);
        document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");

        document.querySelectorAll("[data-i18n]").forEach((el) => {
            const key = el.getAttribute("data-i18n");
            if (t[key] !== undefined) el.textContent = t[key];
        });

        const label = document.getElementById("welcomeLangLabel");
        if (label) label.textContent = lang === "en" ? "AR" : "EN";
    }

    function goChat() {
        localStorage.setItem(STORAGE_SKIP, "true");
        window.location.href = "/chat";
    }

    applyWelcomeLang();

    document.getElementById("welcomeLang")?.addEventListener("click", () => {
        lang = lang === "en" ? "ar" : "en";
        localStorage.setItem(STORAGE_LANG, lang);
        applyWelcomeLang();
    });

    document.getElementById("welcomeSkip")?.addEventListener("click", (e) => {
        e.preventDefault();
        goChat();
    });

    document.getElementById("welcomeStart")?.addEventListener("click", (e) => {
        e.preventDefault();
        goChat();
    });

    document.getElementById("welcomeAbout")?.addEventListener("click", () => {
        document.getElementById("welcome-info")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    // Logo enters chat and remembers skip (same as other entry paths)
    document.getElementById("welcomeLogo")?.addEventListener("click", (e) => {
        e.preventDefault();
        goChat();
    });
})();
