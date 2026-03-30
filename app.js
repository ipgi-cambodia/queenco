const DATA_URL = "jackpot.json";
const POLL_MS = 3000;
const HIDDEN_POLL_MS = 15000;

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

const THEME_META = {
  box1: { label: "KungFu Saga - Level 1", level_name: "Level 1", must_win_max: "30,000", bg_image: "images/kungfu-level1.webp" },
  box2: { label: "KungFu Saga - Level 2", level_name: "Level 2", must_win_max: "5,000", bg_image: "images/kungfu-level2.webp" },
  box3: { label: "Fighting Dragon - Level 1", level_name: "Level 1", must_win_max: "20,000", bg_image: "images/fighting-dragon-level1.webp" },
  box4: { label: "Fighting Dragon - Level 2", level_name: "Level 2", must_win_max: "5,000", bg_image: "images/fighting-dragon-level2.webp" },
  box5: { label: "Prosperity - Level 1", level_name: "Level 1", must_win_max: "20,000", bg_image: "images/prosperity-level1.webp" },
  box6: { label: "Prosperity - Level 2", level_name: "Level 2", must_win_max: "5,000", bg_image: "images/prosperity-level2.webp" },
  box7: { label: "Dragon's Treasure - Level 1", level_name: "Level 1", must_win_max: "5,000", bg_image: "images/dragons-treasure-level1.webp" },
  box8: { label: "Dragon's Treasure - Level 2", level_name: "Level 2", must_win_max: "1,500", bg_image: "images/dragons-treasure-level2.webp" },
};

const meterOrder = Object.keys(THEME_META).map((key) => ({
  key,
  label: THEME_META[key].label,
}));

let renderedCards = {};
let previousValues = {};
let animationFrames = {};
let currentView = "current";
let seenHitKeys = {};
let hitPopupTimer = null;
let pollTimer = null;
let lastPayloadHash = "";

function formatMoney(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

function animateValue(key, el, start, end, duration = 900) {
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
      el.textContent = formatMoney(end);
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
    card.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.78)), url(${bg})`;
    card.style.backgroundSize = "cover";
    card.style.backgroundPosition = "center";
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
  hitPopupTimer = setTimeout(() => hitOverlay.classList.add("hidden"), 4500);
}

function normalizeLastHit(source, currentValue, payloadUpdatedAt) {
  if (source && typeof source === "object") {
    return {
      amount_display: Number(source.amount_display || source.display_value || source.amount || 0),
      datetime: source.datetime || source.updated_at || payloadUpdatedAt || "--",
    };
  }
  return {
    amount_display: 0,
    datetime: "--",
  };
}

function normalizePayload(payload) {
  const sourceMeters = payload?.meters || {};
  const normalized = { updated_at: payload?.updated_at || "--", meters: {} };

  meterOrder.forEach(({ key, label }) => {
    const meta = THEME_META[key] || {};
    const source = sourceMeters[key] || {};
    const displayValue = Number(source.display_value || 0);
    normalized.meters[key] = {
      name: source.name || meta.label || label,
      meter_id: source.meter_id || 0,
      raw_value: source.raw_value || Math.round(displayValue * 100),
      display_value: displayValue,
      level_name: source.level_name || meta.level_name || "",
      must_win_max: source.must_win_max || meta.must_win_max || "",
      bg_image: source.bg_image || meta.bg_image || "",
      last_hit: normalizeLastHit(source.last_hit, displayValue, payload?.updated_at),
    };
  });

  return normalized;
}

function detectNewHits(payload) {
  const meters = payload.meters || {};
  meterOrder.forEach(({ key, label }) => {
    const meter = meters[key] || {};
    const hit = meter.last_hit || {};
    const when = hit.datetime || "--";
    const amount = Number(hit.amount_display || 0);

    if (!(key in seenHitKeys)) {
      seenHitKeys[key] = when;
      return;
    }

    if (when !== "--" && seenHitKeys[key] !== when) {
      seenHitKeys[key] = when;
      showHitPopup(meter.name || label, meter.level_name || "", amount, when);
    }
  });
}

function renderMeters(payload) {
  const meters = payload.meters || {};
  meterOrder.forEach(({ key, label }) => {
    const meter = meters[key] || {};
    const card = ensureCard(key, label);
    const value = Number(meter.display_value || 0);
    const max = parseNumberValue(meter.must_win_max);
    const heat = getHeatState(value, max);

    card.querySelector(".meter-name").textContent = meter.name || label;
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
      animateValue(key, el, previousValues[key], value, 650);
    }

    card.querySelector(".meter-raw-label").textContent = "Max";
    card.querySelector(".meter-raw-value").textContent = meter.must_win_max
      ? `Must be won before ${meter.must_win_max} US DOLLAR`
      : "--";
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
    card.querySelector(".meter-badge").textContent = "HIT";
    card.querySelector(".meter-value").textContent = formatMoney(Number(hit.amount_display || 0));
    card.querySelector(".meter-raw-label").textContent = "When";
    card.querySelector(".meter-raw-value").textContent = hit.datetime || "--";
  });
}

async function fetchSupabasePayload() {
  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const res = await fetch(
    `${url}/rest/v1/landing_payload?id=eq.1&select=payload,updated_at`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: "no-store",
    }
  );

  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
  const rows = await res.json();
  if (!rows.length) return null;
  const row = rows[0] || {};
  const payload = row.payload || {};
  if (!payload.updated_at && row.updated_at) payload.updated_at = row.updated_at;
  return payload;
}

async function fetchJsonPayload() {
  const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`JSON HTTP ${res.status}`);
  return await res.json();
}

function setOnlineStatus(modeText) {
  statusDot.classList.add("online");
  connectionStatus.textContent = modeText;
}

function setButtons() {
  if (currentBtn) currentBtn.classList.toggle("active", currentView === "current");
  if (lastHitsBtn) lastHitsBtn.classList.toggle("active", currentView === "hits");
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  const interval = document.hidden ? HIDDEN_POLL_MS : POLL_MS;
  pollTimer = setInterval(loadData, interval);
}

async function loadData() {
  try {
    let data = null;
    let sourceLabel = "JSON Fallback";

    try {
      data = await fetchSupabasePayload();
      if (data) sourceLabel = "Supabase";
    } catch (e) {
      console.warn("Supabase fetch failed, fallback to JSON:", e);
    }

    if (!data) {
      data = await fetchJsonPayload();
      sourceLabel = "JSON Fallback";
    }

    const normalized = normalizePayload(data);
    const payloadHash = JSON.stringify(normalized);

    detectNewHits(normalized);

    if (payloadHash !== lastPayloadHash) {
      lastPayloadHash = payloadHash;
      if (currentView === "current") {
        renderMeters(normalized);
      } else {
        renderLastHits(normalized);
      }
    } else {
      if (currentView === "current") {
        renderMeters(normalized);
      } else {
        renderLastHits(normalized);
      }
    }

    setOnlineStatus(sourceLabel);
    lastUpdated.textContent = normalized.updated_at || "--";
  } catch (err) {
    console.error(err);
    statusDot.classList.remove("online");
    connectionStatus.textContent = "Waiting for data...";
    lastUpdated.textContent = "--";
  }
}

if (currentBtn) {
  currentBtn.onclick = () => {
    currentView = "current";
    setButtons();
    loadData();
  };
}

if (lastHitsBtn) {
  lastHitsBtn.onclick = () => {
    currentView = "hits";
    setButtons();
    loadData();
  };
}

document.addEventListener("visibilitychange", startPolling);

setButtons();
loadData();
startPolling();
