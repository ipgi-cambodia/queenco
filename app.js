const POLL_MS = 3000;

const metersGrid = document.getElementById("metersGrid");
const template = document.getElementById("meterCardTemplate");
const statusDot = document.getElementById("statusDot");
const connectionStatus = document.getElementById("connectionStatus");
const lastUpdated = document.getElementById("lastUpdated");

const btnCurrent = document.getElementById("btnCurrentJackpot");
const btnLast = document.getElementById("btnLastJackpotHits");

let lastPayloadHash = "";
let currentView = "current";

/* =========================
CONFIG
========================= */
const SUPABASE_URL = window.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "";

/* =========================
CARD META
========================= */
const CARD_META = [
  { box: "box1", name: "KungFu Saga - Level 1", bg: "images/kungfu-level1.webp", max: 30000 },
  { box: "box2", name: "KungFu Saga - Level 2", bg: "images/kungfu-level2.webp", max: 5000 },
  { box: "box3", name: "Fighting Dragon - Level 1", bg: "images/fighting-dragon-level1.webp", max: 25000 },
  { box: "box4", name: "Fighting Dragon - Level 2", bg: "images/fighting-dragon-level2.webp", max: 5000 },
  { box: "box5", name: "Prosperity - Level 1", bg: "images/prosperity-level1.webp", max: 15000 },
  { box: "box6", name: "Prosperity - Level 2", bg: "images/prosperity-level2.webp", max: 3000 },
  { box: "box7", name: "Dragon's Treasure - Level 1", bg: "images/dragons-treasure-level1.webp", max: 20000 },
  { box: "box8", name: "Dragon's Treasure - Level 2", bg: "images/dragons-treasure-level2.webp", max: 1500 }
];

/* =========================
LAST HIT DATA (TEMP)
========================= */
const LAST_HIT_META = {
  box1: { amount: 15000, date: "2026-03-28", time: "18:42" },
  box2: { amount: 5000,  date: "2026-03-29", time: "19:11" },
  box3: { amount: 10000, date: "2026-03-27", time: "18:35" },
  box4: { amount: 3000,  date: "2026-03-29", time: "19:26" },
  box5: { amount: 15000, date: "2026-03-26", time: "18:57" },
  box6: { amount: 5000,  date: "2026-03-28", time: "19:33" },
  box7: { amount: 20000, date: "2026-03-29", time: "18:49" },
  box8: { amount: 1500,  date: "2026-03-30", time: "19:02" }
};

/* =========================
FETCH SUPABASE
========================= */
async function fetchSupabasePayload() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/landing_payload?id=eq.1`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  );

  const json = await res.json();
  return json?.[0]?.payload || null;
}

/* =========================
ANIMATE VALUE
========================= */
function animateValue(el, start, end, duration = 600) {
  let startTime = null;

  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    const progress = timestamp - startTime;
    const percent = Math.min(progress / duration, 1);

    const value = start + (end - start) * percent;

    el.textContent = value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    if (percent < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/* =========================
RENDER CURRENT
========================= */
function render(data) {
  metersGrid.innerHTML = "";

  CARD_META.forEach((meta) => {
    const meter = data?.meters?.[meta.box] || {};
    const value = Number(meter.display_value || 0);

    const clone = template.content.cloneNode(true);

    const card = clone.querySelector(".meter-card");
    const name = clone.querySelector(".meter-name");
    const val = clone.querySelector(".meter-value");
    const badge = clone.querySelector(".meter-badge");
    const rawLabel = clone.querySelector(".meter-raw-label");
    const rawValue = clone.querySelector(".meter-raw-value");

    name.textContent = meta.name;

    animateValue(val, 0, value);

    rawLabel.textContent = "Max:";
    rawValue.textContent = meta.max.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    card.style.backgroundImage = `url("${meta.bg}")`;
    card.style.backgroundSize = "cover";
    card.style.backgroundPosition = "center";

    const percent = value / meta.max;

    card.classList.remove("warm-card", "hot-card");
    badge.textContent = "LIVE";

    if (percent >= 0.9) {
      card.classList.add("hot-card");
      badge.textContent = "HOT";
    } else if (percent >= 0.7) {
      card.classList.add("warm-card");
    }

    metersGrid.appendChild(clone);
  });
}

/* =========================
RENDER LAST HIT
========================= */
function renderLastHits() {
  metersGrid.innerHTML = "";

  CARD_META.forEach((meta) => {
    const hit = LAST_HIT_META[meta.box];

    const clone = template.content.cloneNode(true);

    const card = clone.querySelector(".meter-card");
    const name = clone.querySelector(".meter-name");
    const val = clone.querySelector(".meter-value");
    const badge = clone.querySelector(".meter-badge");
    const rawLabel = clone.querySelector(".meter-raw-label");
    const rawValue = clone.querySelector(".meter-raw-value");

    name.textContent = meta.name;

    val.textContent = Number(hit.amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    badge.textContent = "HIT";
    rawLabel.textContent = hit.date;
    rawValue.textContent = hit.time;

    card.style.backgroundImage = `url("${meta.bg}")`;

    metersGrid.appendChild(clone);
  });
}

/* =========================
BUTTON SWITCH
========================= */
btnCurrent.addEventListener("click", () => {
  currentView = "current";
  btnCurrent.classList.add("active");
  btnLast.classList.remove("active");
  loadData();
});

btnLast.addEventListener("click", () => {
  currentView = "last";
  btnLast.classList.add("active");
  btnCurrent.classList.remove("active");
  renderLastHits();
});

/* =========================
MAIN LOOP
========================= */
async function loadData() {
  try {
    const data = await fetchSupabasePayload();

    if (!data) throw new Error("No data");

    const hash = JSON.stringify(data);

    if (hash !== lastPayloadHash) {
      lastPayloadHash = hash;

      if (currentView === "current") {
        render(data);
      } else {
        renderLastHits();
      }
    }

    statusDot.classList.add("online");
    connectionStatus.textContent = "Supabase";
    lastUpdated.textContent = data.updated_at || "--";

  } catch (err) {
    console.warn(err);
    statusDot.classList.remove("online");
    connectionStatus.textContent = "Waiting for data...";
  }
}

loadData();
setInterval(loadData, POLL_MS);
