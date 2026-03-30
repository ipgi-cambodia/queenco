const APP_CONFIG = window.APP_CONFIG || {};
const SUPABASE_URL = (APP_CONFIG.supabaseUrl || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = APP_CONFIG.supabaseAnonKey || "";
const SUPABASE_TABLE = APP_CONFIG.supabaseTable || "landing_payload";
const SUPABASE_ROW_ID = Number(APP_CONFIG.supabaseRowId || 1);
const FALLBACK_JSON_URL = APP_CONFIG.fallbackJsonUrl || "jackpot.json";
const POLL_MS_ACTIVE = Number(APP_CONFIG.pollMsActive || 3000);
const POLL_MS_HIDDEN = Number(APP_CONFIG.pollMsHidden || 15000);

const metersGrid = document.getElementById("metersGrid");
const statusDot = document.getElementById("statusDot");
const connectionStatus = document.getElementById("connectionStatus");
const lastUpdated = document.getElementById("lastUpdated");
const meterCardTemplate = document.getElementById("meterCardTemplate");

const currentBtn = document.getElementById("btnCurrentJackpot");
const lastHitsBtn = document.getElementById("btnLastJackpotHits");

const hitOverlay = document.getElementById("hitOverlay");
const hitGameName = document.getElementById("hitGameName");
const hitLevelName = document.getElementById("hitLevelName");
const hitAmount = document.getElementById("hitAmount");
const hitDateTime = document.getElementById("hitDateTime");

const meterOrder = [
  { key: "box1", label: "Jackpot 1" },
  { key: "box2", label: "Jackpot 2" },
  { key: "box3", label: "Jackpot 3" },
  { key: "box4", label: "Jackpot 4" },
  { key: "box5", label: "Jackpot 5" },
  { key: "box6", label: "Jackpot 6" },
  { key: "box7", label: "Jackpot 7" },
  { key: "box8", label: "Jackpot 8" },
  { key: "box9", label: "Jackpot 9" }
];

let renderedCards = {};
let previousValues = {};
let animationFrames = {};
let currentView = "current";
let seenHitKeys = {};
let hitPopupTimer = null;
let pollTimer = null;
let lastPayloadSignature = "";
let isLoading = false;

function formatMoney(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function parseNumberValue(value) {
  if (!value) return 0;
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}

function getHeatState(current, max) {
  if (!max) return "normal";
  const ratio = current / max;
  if (ratio >= 0.95) return "hot";
  if (ratio >= 0.8) return "warm";
  return "normal";
}

function ensureCard(key, label) {
  if (renderedCards[key]) return renderedCards[key];

  const node = meterCardTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.key = key;
  node.querySelector(".meter-name").textContent = label;
  metersGrid.appendChild(node);
  renderedCards[key] = node;
  return node;
}

function animateValue(key, el, start, end, duration = 1200) {
  if (animationFrames[key]) cancelAnimationFrame(animationFrames[key]);

  const startTime = performance.now();

  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = start + (end - start) * eased;

    el.textContent = formatMoney(value);

    if (progress < 1) {
      animationFrames[key] = requestAnimationFrame(step);
    } else {
      previousValues[key] = end;
    }
  }

  animationFrames[key] = requestAnimationFrame(step);
}

function clearHeat(card) {
  card.classList.remove("warm-card", "hot-card");
  const badge = card.querySelector(".meter-badge");
  const valueNode = card.querySelector(".meter-value");

  valueNode.classList.remove("warm-value", "hot-value");
  badge.textContent = "LIVE";
}

function applyBackground(card, meter) {
  const bg = meter.bg_image || "";
  if (bg) {
    card.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.8)), url(${bg})`;
    card.style.backgroundSize = "110%";
    card.style.backgroundPosition = "center 60%";
  } else {
    card.style.backgroundImage = "";
  }
}

function showHitPopup(name, level, amount, when) {
  if (!hitOverlay) return;

  hitGameName.textContent = name || "Jackpot";
  hitLevelName.textContent = level || "";
  hitAmount.textContent = formatMoney(amount || 0);
  hitDateTime.textContent = when || "--";

  hitOverlay.classList.remove("hidden");

  if (hitPopupTimer) clearTimeout(hitPopupTimer);

  hitPopupTimer = setTimeout(() => {
    hitOverlay.classList.add("hidden");
  }, 4500);
}

function detectNewHits(payload) {
  const meters = payload.meters || {};

  meterOrder.forEach(({ key, label }) => {
    const meter = meters[key] || {};
    const hit = meter.last_hit || {};

    const when = hit.datetime || "--";
    const amount = Number(hit.amount_display || 0);

    if (!seenHitKeys[key]) {
      seenHitKeys[key] = when;
      return;
    }

    if (when !== "--" && seenHitKeys[key] !== when) {
      seenHitKeys[key] = when;
      showHitPopup(
        meter.name || label,
        meter.level_name || "",
        amount,
        when
      );
    }
  });
}

function renderMeters(payload) {
  const meters = payload.meters || {};

  meterOrder.forEach(({ key, label }) => {
    const meter = meters[key] || {};
    const card = ensureCard(key, label);

    const name = meter.name || label;
    const value = Number(meter.display_value || 0);
    const max = parseNumberValue(meter.must_win_max);
    const heat = getHeatState(value, max);

    card.querySelector(".meter-name").textContent = name;
    card.querySelector(".meter-id").textContent = meter.level_name || "";

    applyBackground(card, meter);
    clearHeat(card);

    const badge = card.querySelector(".meter-badge");
    const valueNode = card.querySelector(".meter-value");

    if (heat === "warm") {
      card.classList.add("warm-card");
      valueNode.classList.add("warm-value");
    } else if (heat === "hot") {
      card.classList.add("hot-card");
      valueNode.classList.add("hot-value");
      badge.textContent = "HOT";
    }

    const el = card.querySelector(".meter-value");

    if (!(key in previousValues)) {
      previousValues[key] = value;
      el.textContent = formatMoney(value);
    } else if (previousValues[key] !== value) {
      animateValue(key, el, previousValues[key], value, 600);
    }

    card.querySelector(".meter-raw-value").textContent = meter.must_win_max
      ? `Must be won before ${meter.must_win_max} US DOLLAR`
      : "";
  });
}

function renderLastHits(payload) {
  const meters = payload.meters || {};

  meterOrder.forEach(({ key, label }) => {
    const meter = meters[key] || {};
    const card = ensureCard(key, label);
    const hit = meter.last_hit || {};

    card.querySelector(".meter-name").textContent = meter.name || label;
    card.querySelector(".meter-id").textContent = meter.level_name || "";

    applyBackground(card, meter);
    clearHeat(card);

    const badge = card.querySelector(".meter-badge");
    badge.textContent = "HIT";

    const amount = Number(hit.amount_display || 0);
    card.querySelector(".meter-value").textContent = formatMoney(amount);

    const when = hit.datetime || "--";
    card.querySelector(".meter-raw-value").textContent = when;
  });
}

async function fetchSupabasePayload() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(SUPABASE_TABLE)}?select=payload,updated_at&id=eq.${SUPABASE_ROW_ID}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    },
    cache: "no-store"
  });

  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows.length || !rows[0].payload) return null;

  const payload = rows[0].payload;
  if (!payload.updated_at && rows[0].updated_at) {
    payload.updated_at = rows[0].updated_at;
  }
  return payload;
}

async function fetchFallbackPayload() {
  const res = await fetch(`${FALLBACK_JSON_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`JSON HTTP ${res.status}`);
  return await res.json();
}

function markOnline(text = "Connected") {
  statusDot.classList.add("online");
  connectionStatus.textContent = text;
}

function markOffline(text = "Waiting for data...") {
  statusDot.classList.remove("online");
  connectionStatus.textContent = text;
}

async function loadData() {
  if (isLoading) return;
  isLoading = true;

  try {
    let data = await fetchSupabasePayload();
    let source = "Supabase";

    if (!data) {
      data = await fetchFallbackPayload();
      source = "Fallback JSON";
    }

    markOnline(source);
    lastUpdated.textContent = data.updated_at || "--";

    const signature = JSON.stringify(data?.meters || {});
    if (signature !== lastPayloadSignature) {
      detectNewHits(data);
      if (currentView === "current") {
        renderMeters(data);
      } else {
        renderLastHits(data);
      }
      lastPayloadSignature = signature;
    }
  } catch (err) {
    console.error(err);
    markOffline("Waiting for data...");
  } finally {
    isLoading = false;
  }
}

function getPollInterval() {
  return document.hidden ? POLL_MS_HIDDEN : POLL_MS_ACTIVE;
}

function restartPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(loadData, getPollInterval());
}

if (currentBtn) {
  currentBtn.onclick = () => {
    currentView = "current";
    currentBtn.classList.add("active");
    lastHitsBtn?.classList.remove("active");
    loadData();
  };
}

if (lastHitsBtn) {
  lastHitsBtn.onclick = () => {
    currentView = "hits";
    lastHitsBtn.classList.add("active");
    currentBtn?.classList.remove("active");
    loadData();
  };
}

document.addEventListener("visibilitychange", restartPolling);
loadData();
restartPolling();
