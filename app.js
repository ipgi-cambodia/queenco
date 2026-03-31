const POLL_MS = 3000;
const ANIMATION_MS = 900;

const metersGrid = document.getElementById("metersGrid");
const template = document.getElementById("meterCardTemplate");
const statusDot = document.getElementById("statusDot");
const connectionStatus = document.getElementById("connectionStatus");
const lastUpdated = document.getElementById("lastUpdated");

const btnCurrent = document.getElementById("btnCurrentJackpot");
const btnLast = document.getElementById("btnLastJackpotHits");

const renderedValues = new Map();
const cardElements = new Map();

let lastPayloadHash = "";
let currentView = "current";
let latestPayload = null;

/* =========================
CONFIG
========================= */
const SUPABASE_URL = window.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "";

/* =========================
CARD METADATA
========================= */
const CARD_META = [
  { key: "box1", name: "KungFu Saga - Level 1", bg: "images/kungfu.webp", max: 30000 },
  { key: "box2", name: "KungFu Saga - Level 2", bg: "images/kungfu.webp", max: 5000 },
  { key: "box3", name: "Fighting Dragon - Level 1", bg: "images/fd.webp", max: 25000 },
  { key: "box4", name: "Fighting Dragon - Level 2", bg: "images/fd.webp", max: 5000 },
  { key: "box5", name: "Prosperity - Level 1", bg: "images/prosperity.webp", max: 15000 },
  { key: "box6", name: "Prosperity - Level 2", bg: "images/prosperity.webp", max: 5000 },
  { key: "box7", name: "Dragon's Treasure - Level 1", bg: "images/dt.webp", max: 20000 },
  { key: "box8", name: "Dragon's Treasure - Level 2", bg: "images/dt.webp", max: 1500 }
];

/* =========================
LAST HIT FALLBACK (TEMP)
Used only if live payload has no last hit data
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

function formatMoney(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function animateValue(el, from, to, duration = ANIMATION_MS) {
  if (el._animFrame) {
    cancelAnimationFrame(el._animFrame);
  }

  const start = performance.now();
  const diff = to - from;

  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = easeOutCubic(t);
    const current = from + diff * eased;
    el.textContent = formatMoney(current);

    if (t < 1) {
      el._animFrame = requestAnimationFrame(step);
    } else {
      el.textContent = formatMoney(to);
      el._animFrame = null;
    }
  }

  el._animFrame = requestAnimationFrame(step);
}

/* =========================
FETCH SUPABASE
========================= */
async function fetchSupabasePayload() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase config missing");
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/landing_payload?id=eq.1`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });

  if (!res.ok) {
    throw new Error(`Supabase fetch failed: ${res.status}`);
  }

  const json = await res.json();
  return json?.[0]?.payload || null;
}

/* =========================
PAYLOAD HELPERS
Supports either:
payload.last_hits.box1
or
payload.meters.box1.last_hit
========================= */
function getLiveLastHit(payload, key) {
  if (!payload) return null;

  const direct = payload.last_hits?.[key];
  if (direct && (direct.amount != null || direct.date || direct.time)) {
    return {
      amount: Number(direct.amount || 0),
      date: direct.date || "--",
      time: direct.time || "--"
    };
  }

  const nested = payload.meters?.[key]?.last_hit;
  if (nested && (nested.amount != null || nested.date || nested.time)) {
    return {
      amount: Number(nested.amount || 0),
      date: nested.date || "--",
      time: nested.time || "--"
    };
  }

  return null;
}

function getResolvedLastHit(payload, key) {
  return getLiveLastHit(payload, key) || LAST_HIT_META[key] || {
    amount: 0,
    date: "--",
    time: "--"
  };
}

/* =========================
BUILD CURRENT VIEW CARDS
========================= */
function buildCard(meta) {
  const clone = template.content.cloneNode(true);

  const card = clone.querySelector(".meter-card");
  const name = clone.querySelector(".meter-name");
  const val = clone.querySelector(".meter-value");
  const badge = clone.querySelector(".meter-badge");
  const rawLabel = clone.querySelector(".meter-raw-label");
  const rawValue = clone.querySelector(".meter-raw-value");

  name.textContent = meta.name;
  rawLabel.textContent = "Max:";
  rawValue.textContent = formatMoney(meta.max);

  card.style.backgroundImage = `url("${meta.bg}")`;
  card.style.backgroundSize = "cover";
  card.style.backgroundPosition = "center";

  metersGrid.appendChild(clone);

  cardElements.set(meta.key, {
    card,
    valueEl: val,
    badgeEl: badge,
    rawLabelEl: rawLabel,
    rawValueEl: rawValue
  });
}

function ensureCards() {
  if (cardElements.size === CARD_META.length && currentView === "current") return;

  metersGrid.innerHTML = "";
  cardElements.clear();

  CARD_META.forEach((meta) => buildCard(meta));
}

function updateCard(meta, meterData) {
  const refs = cardElements.get(meta.key);
  if (!refs) return;

  const value = Number(meterData?.display_value || 0);
  const previous = renderedValues.has(meta.key) ? renderedValues.get(meta.key) : value;

  animateValue(refs.valueEl, previous, value);
  renderedValues.set(meta.key, value);

  refs.rawLabelEl.textContent = "Max:";
  refs.rawValueEl.textContent = formatMoney(meta.max);

  const percent = meta.max > 0 ? value / meta.max : 0;

  refs.card.classList.remove("warm-card", "hot-card");
  refs.valueEl.classList.remove("warm-value", "hot-value");
  refs.badgeEl.textContent = "LIVE";

  if (percent >= 0.9) {
    refs.card.classList.add("hot-card");
    refs.valueEl.classList.add("hot-value");
    refs.badgeEl.textContent = "HOT";
  } else if (percent >= 0.7) {
    refs.card.classList.add("warm-card");
    refs.valueEl.classList.add("warm-value");
  }
}

function renderCurrent(data) {
  ensureCards();

  CARD_META.forEach((meta) => {
    const meter = data?.meters?.[meta.key] || {};
    updateCard(meta, meter);
  });
}

/* =========================
RENDER LAST HIT VIEW
========================= */
function renderLastHits(payload = latestPayload) {
  metersGrid.innerHTML = "";
  cardElements.clear();

  CARD_META.forEach((meta) => {
    const liveHit = payload?.meters?.[meta.key]?.last_hit || null;

    let amount = 0;
    let date = "--";
    let time = "--";

    if (liveHit && typeof liveHit === "object") {
      amount = Number(liveHit.amount_display || 0);

      const dt = String(liveHit.datetime || "--").trim();
      if (dt && dt !== "--") {
        const parts = dt.split(" ");
        date = parts[0] || "--";
        time = parts[1] || "--";
      }
    } else {
      const fallback = LAST_HIT_META[meta.key] || { amount: 0, date: "--", time: "--" };
      amount = Number(fallback.amount || 0);
      date = fallback.date || "--";
      time = fallback.time || "--";
    }

    const clone = template.content.cloneNode(true);

    const card = clone.querySelector(".meter-card");
    const name = clone.querySelector(".meter-name");
    const val = clone.querySelector(".meter-value");
    const badge = clone.querySelector(".meter-badge");
    const rawLabel = clone.querySelector(".meter-raw-label");
    const rawValue = clone.querySelector(".meter-raw-value");

    name.textContent = meta.name;
    val.textContent = formatMoney(amount);

    badge.textContent = "HIT";
    rawLabel.textContent = date;
    rawValue.textContent = time;

    card.style.backgroundImage = `url("${meta.bg}")`;
    card.style.backgroundSize = "cover";
    card.style.backgroundPosition = "center";

    metersGrid.appendChild(clone);
  });
}

/* =========================
STATUS
========================= */
function setOnline() {
  statusDot.classList.add("online");
  connectionStatus.textContent = "ONLINE";
}

function setOffline() {
  statusDot.classList.remove("online");
  connectionStatus.textContent = "Waiting for data...";
}

/* =========================
BUTTON SWITCH
========================= */
btnCurrent?.addEventListener("click", async () => {
  currentView = "current";
  btnCurrent.classList.add("active");
  btnLast?.classList.remove("active");

  try {
    const data = latestPayload || await fetchSupabasePayload();
    if (data) {
      latestPayload = data;
      renderCurrent(data);
      setOnline();
      lastUpdated.textContent = data.updated_at || "--";
    }
  } catch (err) {
    console.warn(err);
    loadData();
  }
});

btnLast?.addEventListener("click", () => {
  currentView = "last";
  btnLast.classList.add("active");
  btnCurrent?.classList.remove("active");
  renderLastHits(latestPayload);
});

/* =========================
MAIN LOOP
========================= */
async function loadData() {
  try {
    const data = await fetchSupabasePayload();
    if (!data) throw new Error("No data");

    latestPayload = data;

    const hash = JSON.stringify(data);
    const dataChanged = hash !== lastPayloadHash;
    lastPayloadHash = hash;

    if (currentView === "current") {
      renderCurrent(data);
    } else if (dataChanged) {
      renderLastHits(data);
    }

    setOnline();
    lastUpdated.textContent = data.updated_at || "--";
  } catch (err) {
    console.warn(err);
    setOffline();
  }
}

loadData();
setInterval(loadData, POLL_MS);
