const POLL_MS = 3000;
const ANIMATION_MS = 900;

const metersGrid = document.getElementById("metersGrid");
const template = document.getElementById("meterCardTemplate");
const statusDot = document.getElementById("statusDot");
const connectionStatus = document.getElementById("connectionStatus");
const lastUpdated = document.getElementById("lastUpdated");

const btnCurrent = document.getElementById("btnCurrentJackpot");
const btnLast = document.getElementById("btnLastJackpotHits");

const hitOverlay = document.getElementById("hitOverlay");
const hitGameName = document.getElementById("hitGameName");
const hitLevelName = document.getElementById("hitLevelName");
const hitAmount = document.getElementById("hitAmount");
const hitDateTime = document.getElementById("hitDateTime");

const renderedValues = new Map();
const cardElements = new Map();
const seenHitTimestamps = new Map();

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
  { key: "box1", name: "KungFu Saga - Level 1", bg: "images/kungfu.webp", max: 3000 },
  { key: "box2", name: "KungFu Saga - Level 2", bg: "images/kungfu.webp", max: 3000 },
  { key: "box3", name: "Fighting Dragon - Level 1", bg: "images/fd.webp", max: 10000 },
  { key: "box4", name: "Fighting Dragon - Level 2", bg: "images/fd.webp", max: 1500 },
  { key: "box5", name: "Prosperity - Level 1", bg: "images/prosperity.webp", max: 10000 },
  { key: "box6", name: "Prosperity - Level 2", bg: "images/prosperity.webp", max: 10000 },
  { key: "box7", name: "Dragon's Treasure - Level 1", bg: "images/dt.webp", max: 20000 },
  { key: "box8", name: "Dragon's Treasure - Level 2", bg: "images/dt.webp", max: 20000 }
];

/* =========================
LAST HIT FALLBACK
Only used if payload has no live last_hit yet
========================= */
const LAST_HIT_META = {
  box1: { amount: 0, date: "--", time: "--" },
  box2: { amount: 0, date: "--", time: "--" },
  box3: { amount: 0, date: "--", time: "--" },
  box4: { amount: 0, date: "--", time: "--" },
  box5: { amount: 0, date: "--", time: "--" },
  box6: { amount: 0, date: "--", time: "--" },
  box7: { amount: 0, date: "--", time: "--" },
  box8: { amount: 0, date: "--", time: "--" }
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
LAST HIT HELPERS
========================= */
function getLiveLastHit(payload, key) {
  if (!payload) return null;

  const nested = payload?.meters?.[key]?.last_hit;
  if (!nested) return null;

  return {
    amount_raw: Number(nested.amount_raw || 0),
    amount_display: Number(nested.amount_display || 0),
    datetime: String(nested.datetime || "--").trim()
  };
}

function getResolvedLastHit(payload, key) {
  const live = getLiveLastHit(payload, key);
  if (live && live.datetime && live.datetime !== "--") {
    const parts = live.datetime.split(" ");
    return {
      amount: Number(live.amount_display || 0),
      date: parts[0] || "--",
      time: parts[1] || "--",
      datetime: live.datetime
    };
  }

  const fallback = LAST_HIT_META[key] || { amount: 0, date: "--", time: "--" };
  return {
    amount: Number(fallback.amount || 0),
    date: fallback.date || "--",
    time: fallback.time || "--",
    datetime: `${fallback.date || "--"} ${fallback.time || "--"}`
  };
}

/* =========================
HIT POPUP
========================= */
function triggerHitFlash() {
  const flash = document.createElement("div");
  flash.className = "hit-flash";
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 450);
}

function showHitPopup(meta, hit) {
  if (!hitOverlay || !hitGameName || !hitLevelName || !hitAmount || !hitDateTime) return;

  hitGameName.textContent = meta.name || "Jackpot Hit";
  hitLevelName.textContent = "JACKPOT WIN";
  hitAmount.textContent = formatMoney(hit.amount_display || 0);
  hitDateTime.textContent = hit.datetime || "--";

  hitOverlay.classList.remove("hidden");
  triggerHitFlash();

  clearTimeout(showHitPopup._hideTimer);
  showHitPopup._hideTimer = setTimeout(() => {
    hitOverlay.classList.add("hidden");
  }, 5000);
}

function detectNewHits(payload) {
  if (!payload?.meters) return;

  CARD_META.forEach((meta) => {
    const hit = getLiveLastHit(payload, meta.key);
    if (!hit) return;
    if (!hit.datetime || hit.datetime === "--") return;
    if (!hit.amount_display || hit.amount_display <= 0) return;

    const prevSeen = seenHitTimestamps.get(meta.key);
    if (prevSeen !== hit.datetime) {
      if (prevSeen !== undefined) {
        showHitPopup(meta, hit);
      }
      seenHitTimestamps.set(meta.key, hit.datetime);
    }
  });
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
    const hit = getResolvedLastHit(payload, meta.key);

    const clone = template.content.cloneNode(true);

    const card = clone.querySelector(".meter-card");
    const name = clone.querySelector(".meter-name");
    const val = clone.querySelector(".meter-value");
    const badge = clone.querySelector(".meter-badge");
    const rawLabel = clone.querySelector(".meter-raw-label");
    const rawValue = clone.querySelector(".meter-raw-value");

    name.textContent = meta.name;
    val.textContent = formatMoney(hit.amount);

    badge.textContent = "HIT";
    rawLabel.textContent = hit.date || "--";
    rawValue.textContent = hit.time || "--";

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
  connectionStatus.textContent = "Supabase";
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

hitOverlay?.addEventListener("click", () => {
  hitOverlay.classList.add("hidden");
});

/* =========================
MAIN LOOP
========================= */
async function loadData() {
  try {
    const data = await fetchSupabasePayload();
    if (!data) throw new Error("No data");

    latestPayload = data;
    detectNewHits(data);

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
