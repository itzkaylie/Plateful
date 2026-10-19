// shared.js — used by every game page (kitchen, fridge, recipe book).
// It handles:
//   1. The QR session ID that links the laptop and the phone.
//   2. Saving progress in the browser (localStorage).
//   3. "Tonight's quest" — the 4 steps and the tracker on screen.
//   4. Little pop-up messages like "Nice find!".
//   5. Checking for scans made on the phone.

// ---------- 1. QR session ----------
// The laptop makes a random session ID. The QR code sends the phone to
// fridge.html?session=THAT_ID, so both devices use the same ID and the
// server can pass the phone's scan back to the laptop.

const urlSessionId = new URLSearchParams(window.location.search).get("session");

if (urlSessionId) {
  // Opened from the QR code: this device is the phone.
  sessionStorage.setItem("scanSessionId", urlSessionId);
  sessionStorage.setItem("isPhone", "yes");
}

let sessionId = sessionStorage.getItem("scanSessionId");
if (!sessionId) {
  sessionId =
    window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem("scanSessionId", sessionId);
}

const isPhone = sessionStorage.getItem("isPhone") === "yes";

// The address the phone should open.
function phoneScanUrl() {
  const url = new URL("/fridge.html", window.location.origin);
  url.searchParams.set("session", sessionId);
  return url.toString();
}

// ---------- 2. Saving things in the browser ----------
// try/catch because some private-browsing modes block storage.

function load(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch (error) {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("Could not save to this browser:", error);
  }
}

// Tonight's quest progress.
const EMPTY_QUEST = {
  ingredients: [],      // what's in the fridge
  reviewed: false,      // step 2 done?
  recipes: [],          // ideas from Gemini
  chosen: null,         // the recipe picked for tonight (step 3)
  finished: false,      // step 4 done?
  lastServerScan: ""    // the last scan we got from the server (to spot new phone scans)
};

function getQuest() {
  return Object.assign({}, EMPTY_QUEST, load("plateful-quest", {}));
}

function saveQuest(quest) {
  save("plateful-quest", quest);
  renderQuest();
}

function resetQuest() {
  // Keep lastServerScan, so the old scan isn't pulled back in by the phone check.
  const fresh = Object.assign({}, EMPTY_QUEST, { lastServerScan: getQuest().lastServerScan });
  saveQuest(fresh);
}

// Recipe book and shopping list are kept even when you start a new quest.
function getBook() { return load("plateful-book", []); }
function saveBook(book) { save("plateful-book", book); }
function getShopping() { return load("plateful-shopping", []); }
function saveShopping(list) { save("plateful-shopping", list); }

// ---------- 3. Tonight's quest tracker ----------

const QUEST_STEPS = [
  { text: "Scan the fridge", page: "fridge.html", isDone: q => q.ingredients.length > 0 },
  { text: "Review the ingredients", page: "fridge.html#review", isDone: q => q.reviewed },
  { text: "Choose a recipe", page: "recipe.html", isDone: q => q.chosen !== null },
  { text: "Save it or add missing items to your shopping list", page: "recipe.html#tonight", isDone: q => q.finished }
];

// Index of the first step that isn't done yet (4 means all done).
function currentStepIndex(quest = getQuest()) {
  const index = QUEST_STEPS.findIndex(step => !step.isDone(quest));
  return index === -1 ? QUEST_STEPS.length : index;
}

// Draws the quest list into any element with id="quest".
function renderQuest() {
  const box = document.getElementById("quest");
  if (!box) return;

  const quest = getQuest();
  const current = currentStepIndex(quest);
  const doneCount = QUEST_STEPS.filter(step => step.isDone(quest)).length;

  const list = document.createElement("ol");
  list.className = "quest-list";

  QUEST_STEPS.forEach((step, index) => {
    const done = step.isDone(quest);
    const item = document.createElement("li");
    item.className = "quest-step" + (done ? " done" : "") + (index === current ? " current" : "");
    if (index === current) item.setAttribute("aria-current", "step");

    const check = document.createElement("span");
    check.className = "quest-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = done ? "✓" : String(index + 1);

    const text = document.createElement("span");
    text.className = "quest-text";
    const link = document.createElement("a");
    link.href = step.page;
    link.textContent = step.text;
    text.append(link);

    // Screen readers hear "done" or "to do" too.
    const state = document.createElement("span");
    state.className = "sr-only";
    state.textContent = done ? " (done)" : " (to do)";
    text.append(state);

    item.append(check, text);
    list.append(item);
  });

  const progress = document.createElement("div");
  progress.className = "quest-progress";
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-label", "Quest progress");
  progress.setAttribute("aria-valuemin", "0");
  progress.setAttribute("aria-valuemax", String(QUEST_STEPS.length));
  progress.setAttribute("aria-valuenow", String(doneCount));
  const bar = document.createElement("span");
  bar.style.width = `${(doneCount / QUEST_STEPS.length) * 100}%`;
  progress.append(bar);

  const counter = document.createElement("p");
  counter.className = "hint";
  counter.textContent = `${doneCount} of ${QUEST_STEPS.length} steps done`;

  box.replaceChildren(list, progress, counter);

  if (doneCount === QUEST_STEPS.length) {
    const complete = document.createElement("div");
    complete.className = "quest-complete";
    complete.textContent = `★ Quest complete! Tonight you're making ${quest.chosen ? quest.chosen.name : "something tasty"}.`;
    const again = document.createElement("button");
    again.type = "button";
    again.className = "btn small secondary";
    again.textContent = "Start a new quest";
    again.addEventListener("click", () => {
      resetQuest();
      showToast("Fresh quest! Go scan the fridge.");
      document.dispatchEvent(new Event("quest-reset"));
    });
    const row = document.createElement("div");
    row.className = "btn-row";
    row.append(again);
    complete.append(row);
    box.append(complete);
  }

  // Let pages update their own "next step" hints (like the bouncing "!").
  document.dispatchEvent(new CustomEvent("quest-updated", { detail: { current } }));
}

// ---------- 4. Pop-up messages ----------

let toastTimer;

function showToast(message) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    toast.setAttribute("role", "status"); // screen readers read it out
    document.body.append(toast);
  }
  toast.hidden = true;
  toast.textContent = message;
  // Re-show it on the next frame so the pop-in animation plays again.
  requestAnimationFrame(() => { toast.hidden = false; });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

// ---------- 5. Phone scans ----------
// Call this after a scan to store the new ingredients and restart steps 2–4.

function applyScan(items) {
  const quest = getQuest();
  quest.ingredients = items.slice();
  quest.reviewed = false;
  quest.recipes = [];
  quest.chosen = null;
  quest.finished = false;
  quest.lastServerScan = JSON.stringify(items);
  saveQuest(quest);
}

// Asks the server once a second whether a new scan arrived for this session
// (for example, from the phone). Only reacts when the scan is NEW, so it
// doesn't erase ingredients you edited by hand.
function watchForPhoneScans(onNewScan) {
  async function check() {
    try {
      const response = await fetch("/api/latest-scan", {
        headers: { "X-Session-ID": sessionId }
      });
      if (!response.ok) return;

      const result = await response.json();
      if (!result || !Array.isArray(result.items)) return;

      if (JSON.stringify(result.items) === getQuest().lastServerScan) return;

      applyScan(result.items);
      showToast(`Phone scan arrived! Nice find — ${result.items.length} ingredients.`);
      if (onNewScan) onNewScan(result.items);
    } catch (error) {
      console.error("Could not get the latest scan:", error);
    }
  }

  check();
  setInterval(check, 1000);
}

// Draw the tracker as soon as the page loads.
renderQuest();
