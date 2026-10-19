// fridge.js — the fridge page.
// Step 1: pick a photo, send it to /api/scan, show the ingredients.
// Step 2: let the user fix the list, then move on to the recipe book.
// (Helpers like getQuest, showToast and sessionId come from shared.js.)

const photoInput = document.querySelector("#photo");
const preview = document.querySelector("#preview");
const scanButton = document.querySelector("#scan");
const scanStatus = document.querySelector("#scan-status");
const ingredientsList = document.querySelector("#ingredients");
const noIngredients = document.querySelector("#no-ingredients");
const addForm = document.querySelector("#add-form");
const addInput = document.querySelector("#add-input");
const reviewDoneButton = document.querySelector("#review-done");

// ---------- show the ingredient list ----------

function showIngredients() {
  const items = getQuest().ingredients;

  ingredientsList.replaceChildren(
    ...items.map((food, index) => {
      const item = document.createElement("li");
      item.className = "chip";

      const name = document.createElement("span");
      name.textContent = food;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "✕";
      remove.setAttribute("aria-label", `Remove ${food}`);
      remove.addEventListener("click", () => removeIngredient(index));

      item.append(name, remove);
      return item;
    })
  );

  noIngredients.hidden = items.length > 0;
  reviewDoneButton.disabled = items.length === 0;
}

function removeIngredient(index) {
  const quest = getQuest();
  const [removed] = quest.ingredients.splice(index, 1);
  saveQuest(quest);
  showIngredients();
  showToast(`Removed ${removed}.`);
  // Keep keyboard focus somewhere sensible after the button disappears.
  addInput.focus();
}

addForm.addEventListener("submit", event => {
  event.preventDefault(); // stop the page from reloading
  const food = addInput.value.trim();
  if (!food) return;

  const quest = getQuest();
  const alreadyThere = quest.ingredients.some(item => item.toLowerCase() === food.toLowerCase());
  if (alreadyThere) {
    showToast(`${food} is already on the list.`);
  } else {
    quest.ingredients.push(food);
    saveQuest(quest);
    showIngredients();
    showToast(`Added ${food}!`);
  }
  addInput.value = "";
});

reviewDoneButton.addEventListener("click", () => {
  const quest = getQuest();
  quest.reviewed = true;
  saveQuest(quest);
  showToast("Step 2 done! Off to the recipe book…");
  setTimeout(() => { window.location.href = "recipe.html"; }, 900);
});

// ---------- step 1: photo + scan ----------

photoInput.addEventListener("change", () => {
  const photo = photoInput.files[0];
  if (!photo) return;

  preview.src = URL.createObjectURL(photo);
  preview.hidden = false;
  scanButton.disabled = false;
  scanStatus.textContent = "Photo ready! Press “Scan my fridge”.";
  scanStatus.classList.remove("error");
});

// Phone photos can be huge. This shrinks them to max 1600px wide/tall
// before uploading, so the scan is faster. If anything goes wrong,
// we just send the original photo.
async function shrinkPhoto(file) {
  try {
    const image = new Image();
    image.src = URL.createObjectURL(file);
    await image.decode();

    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob || file;
  } catch (error) {
    console.warn("Could not shrink the photo, sending the original.", error);
    return file;
  }
}

scanButton.addEventListener("click", async () => {
  const original = photoInput.files[0];
  if (!original) return;

  scanButton.disabled = true;
  scanButton.textContent = "Scanning…";
  scanStatus.textContent = "Peeking inside your fridge…";
  scanStatus.classList.remove("error");

  try {
    const photo = await shrinkPhoto(original);

    const response = await fetch("/api/scan", {
      method: "POST",
      headers: {
        "Content-Type": photo.type || "image/jpeg",
        "X-Session-ID": sessionId
      },
      body: photo
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || `Request failed (${response.status})`);
    }

    applyScan(result.items); // from shared.js: saves the list + ticks step 1
    showIngredients();

    if (result.items.length === 0) {
      scanStatus.textContent = "Hmm, I couldn't spot any food. Try a brighter photo, or add items by hand.";
    } else {
      scanStatus.textContent = `Found ${result.items.length} ingredients. Check them below.`;
      showToast(`Nice find! ${result.items.length} ingredients spotted ✓`);
      if (isPhone) {
        scanStatus.textContent += " They're on your laptop too.";
      }
      document.getElementById("review").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (error) {
    console.error(error);
    scanStatus.textContent = error.message;
    scanStatus.classList.add("error");
  } finally {
    scanButton.disabled = false;
    scanButton.textContent = "Scan my fridge";
  }
});

// ---------- laptop vs phone ----------

if (isPhone) {
  // On the phone: no QR code needed.
  document.getElementById("qr-panel").hidden = true;
  document.getElementById("phone-hint").hidden = false;
} else {
  // On the laptop: show the QR code and listen for scans from the phone.
  if (window.QRCode) {
    new QRCode(document.getElementById("qrcode"), {
      text: phoneScanUrl(),
      width: 200,
      height: 200
    });
  } else {
    document.getElementById("qrcode").textContent = "QR code couldn't load. Open this page on your phone: " + phoneScanUrl();
  }
  watchForPhoneScans(() => showIngredients());
}

// If "Start a new quest" is pressed, empty the list on screen too.
document.addEventListener("quest-reset", showIngredients);

showIngredients();
