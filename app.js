const POLL_MS = 3000;

const metersGrid = document.getElementById("metersGrid");
const template = document.getElementById("meterCardTemplate");
const statusDot = document.getElementById("statusDot");
const connectionStatus = document.getElementById("connectionStatus");
const lastUpdated = document.getElementById("lastUpdated");

let lastPayloadHash = "";
let currentView = "current";

/* =========================
CONFIG (from config.js)
========================= */
const SUPABASE_URL = window.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "";

/* =========================
CARD METADATA (IMPORTANT)
========================= */
const CARD_META = [
  { name: "KungFu Saga - Level 1", bg: "images/kungfu.webp", max: 25000 },
  { name: "KungFu Saga - Level 2", bg: "images/kungfu.webp", max: 5000 },
  { name: "Fighting Dragon - Level 1", bg: "images/fd.webp", max: 25000 },
  { name: "Fighting Dragon - Level 2", bg: "images/fd.webp", max: 5000 },
  { name: "Prosperity - Level 1", bg: "images/prosperity.webp", max: 25000 },
  { name: "Prosperity - Level 2", bg: "images/prosperity.webp", max: 5000 },
  { name: "Dragon's Treasure - Level 1", bg: "images/dt.webp", max: 25000 },
  { name: "Dragon's Treasure - Level 2", bg: "images/dt", max: 5000 }
];

/* =========================
FETCH SUPABASE
========================= */
async function fetchSupabasePayload() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase config missing");
  }

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
RENDER
========================= */
function render(data) {
  metersGrid.innerHTML = "";

  CARD_META.forEach((meta, i) => {
    const box = data?.meters?.[`box${i + 1}`] || {};
    const value = box.display_value || 0;

    const clone = template.content.cloneNode(true);

    const card = clone.querySelector(".meter-card");
    const name = clone.querySelector(".meter-name");
    const val = clone.querySelector(".meter-value");
    const badge = clone.querySelector(".meter-badge");

    name.textContent = meta.name;
    val.textContent = value.toLocaleString(undefined, { minimumFractionDigits: 2 });

    card.style.backgroundImage = `url(${meta.bg})`;

    const percent = value / meta.max;

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
MAIN LOOP
========================= */
async function loadData() {
  try {
    const data = await fetchSupabasePayload();

    if (!data) throw new Error("No data");

    const hash = JSON.stringify(data);

    if (hash !== lastPayloadHash) {
      lastPayloadHash = hash;
      render(data);
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
