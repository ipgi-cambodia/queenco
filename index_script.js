document.addEventListener("DOMContentLoaded", async () => {
  setupNavigation();
  setupMobileMenu();
  initLanguageSelector();
  applyTranslations();

  await Promise.all([
    loadSection("benefits", "sections/benefits.html"),
    loadSection("pointsrace", "sections/pointsrace.html"),
    loadSection("jackpot", "sections/jackpot.html")
  ]);

  await renderPointsRace();
  await loadJackpotLiveAssets();
  applyTranslations();
  setupRevealAnimations();
  setupSectionSpy();
});

async function loadSection(sectionId, filePath) {
  const target = document.getElementById(sectionId);
  if (!target) return;

  try {
    const response = await fetch(filePath);
    if (!response.ok) throw new Error(`Unable to load ${filePath}`);

    target.innerHTML = await response.text();
    applyTranslations();
  } catch (error) {
    target.innerHTML = `
      <div class="benefits-section">
        <div class="section-heading">
          <h1>Section Error</h1>
          <p>Unable to load ${filePath}. Please run this website using localhost or Live Server.</p>
        </div>
      </div>
    `;
    console.error(error);
  }
}

async function loadJackpotLiveAssets() {
  const jackpotRoot = document.getElementById("jackpot");
  if (!jackpotRoot || !document.getElementById("metersGrid")) return;

  try {
    await loadScriptOnce("jackpot-config-script", "jackpot/jackpot_config.js");
    await loadScriptOnce("supabase-client-script", "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");
    await loadScriptOnce("jackpot-app-script", "jackpot/jackpot_app.js");
  } catch (error) {
    console.error("Unable to load Jackpot Live scripts", error);
    const grid = document.getElementById("metersGrid");
    if (grid) {
      grid.innerHTML = `<div class="jackpot-status-card">Unable to load Jackpot Live scripts.</div>`;
    }
  }
}

function loadScriptOnce(id, src) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      if (existing.dataset.loaded === "true") resolve();
      else existing.addEventListener("load", resolve, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.defer = false;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

function setupRevealAnimations() {
  const revealItems = document.querySelectorAll(".reveal-item, .reveal-card, .reveal-mini, .reveal-row");

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 }
  );

  revealItems.forEach(item => {
    if (!item.classList.contains("is-visible")) observer.observe(item);
  });
}

function setupNavigation() {
  const navLinks = document.querySelectorAll(".nav-link");

  navLinks.forEach(link => {
    link.addEventListener("click", () => {
      navLinks.forEach(item => item.classList.remove("active"));
      link.classList.add("active");
      closeMobileMenu();
    });
  });
}

function setupMobileMenu() {
  const menuToggle = document.querySelector(".menu-toggle");
  const mainNav = document.querySelector(".main-nav");

  if (!menuToggle || !mainNav) return;

  menuToggle.addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("nav-open");
    menuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) closeMobileMenu();
  });
}

function closeMobileMenu() {
  const menuToggle = document.querySelector(".menu-toggle");
  document.body.classList.remove("nav-open");
  if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
}

function setupSectionSpy() {
  const sections = document.querySelectorAll("main > section[id]");
  const navLinks = document.querySelectorAll(".nav-link");

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;

        navLinks.forEach(link => {
          link.classList.toggle(
            "active",
            link.getAttribute("href") === `#${entry.target.id}`
          );
        });
      });
    },
    { rootMargin: "-35% 0px -45% 0px", threshold: 0.01 }
  );

  sections.forEach(section => observer.observe(section));
}

async function renderPointsRace() {
  const tableHead = document.getElementById("pointsrace-head");
  const tableBody = document.getElementById("pointsrace-body");
  const updatedLabel = document.getElementById("pointsrace-updated");
  const countLabel = document.getElementById("pointsrace-count");

  if (!tableHead || !tableBody) return;

  try {
    const response = await fetch("pointsrace.json");
    if (!response.ok) throw new Error("Unable to load pointsrace.json");

    const data = await response.json();
    const headers = Array.isArray(data.headers) ? data.headers : [];
    const participants = Array.isArray(data.participants) ? data.participants : [];

    tableHead.innerHTML = `
      <tr>
        ${headers.map(label => `<th scope="col">${formatHeaderLabel(label)}</th>`).join("")}
      </tr>
    `;

    tableBody.innerHTML = participants.map((participant, index) => {
      const rank = participant.rank ?? index + 1;
      const medalClass = rank === 1 ? " top-1" : rank === 2 ? " top-2" : rank === 3 ? " top-3" : "";
      const rowClass = rank === 1 ? " top-row top-row-1" : rank === 2 ? " top-row top-row-2" : rank === 3 ? " top-row top-row-3" : "";

      return `
        <tr class="reveal-row${rowClass}" style="animation-delay:${Math.min(index * 0.08, 0.45)}s">
          <td>
            <span class="rank-pill${medalClass}">${escapeHtml(String(rank))}</span>
          </td>
          <td>${escapeHtml(participant.membershipNo ?? "-")}</td>
          <td>${escapeHtml(participant.prizes ?? "-")}</td>
          <td>${formatPoints(participant.points)}</td>
          <td>${formatPoints(participant.pointsLevelFor2xMultiplier)}</td>
          <td>${formatMultiplierGap(participant.pointsLevelForMultiplier)}</td>
          <td>${escapeHtml(participant.newPrizes ?? "-")}</td>
        </tr>
      `;
    }).join("");

    if (updatedLabel) updatedLabel.textContent = `${t("points.updated")}: ${data.updatedAt || "--"}`;
    if (countLabel) countLabel.textContent = participants.length || 0;

    applyTranslations();
    setupRevealAnimations();
  } catch (error) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="pointsrace-loading">${t("points.unable")}</td>
      </tr>
    `;
    console.error(error);
  }
}

function formatHeaderLabel(value) {
  const label = String(value)
    .replace("Points Level For 2X Multiplier", "Points Level For\n2X Multiplier")
    .replace("Points Level For Multiplier", "Points Level For\nMultiplier")
    .replace("New Prizes", "New\nPrizes");

  return escapeHtml(label).replace(/\n/g, "<br>");
}

function formatMultiplierGap(value) {
  if (value === null || value === undefined || value === "") return "-";

  const numeric = typeof value === "number" ? value : Number(String(value).replace(/[$,()]/g, ""));

  if (Number.isFinite(numeric)) {
    if (numeric < 0) {
      return `<span class="value-negative">(${Math.abs(numeric).toLocaleString()})</span>`;
    }

    return `<span class="value-positive">${numeric.toLocaleString()}</span>`;
  }

  return escapeHtml(String(value));
}

function formatPoints(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return value.toLocaleString();
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString() : escapeHtml(String(value));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
