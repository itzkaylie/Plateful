// recipe.js — the recipe book page.
// Step 3: ask /api/recipes for ideas and pick one for tonight.
// Step 4: save it to the recipe book, or add its missing ingredients
//         to the shopping list.
// (Helpers like getQuest, saveQuest, showToast come from shared.js.)

const haveList = document.querySelector("#have-list");
const needScan = document.querySelector("#need-scan");
const recipesButton = document.querySelector("#get-recipes");
const recipeStatus = document.querySelector("#recipe-status");
const recipeResults = document.querySelector("#recipes");
const savedRecipesBox = document.querySelector("#saved-recipes");
const shoppingListBox = document.querySelector("#shopping-list");
const shoppingEmpty = document.querySelector("#shopping-empty");
const shoppingForm = document.querySelector("#shopping-form");
const shoppingInput = document.querySelector("#shopping-input");
const clearCheckedButton = document.querySelector("#clear-checked");

// Small helper: make an element with a class and some text.
function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeButton(text, className, onClick) {
  const button = make("button", className, text);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

// Builds one recipe card. "extraButtons" are added at the bottom.
function recipeCard(recipe, extraButtons) {
  const card = make("article", "recipe-card");
  card.append(make("h3", "", recipe.name));

  const missing = recipe.missing || [];
  if (missing.length > 0) {
    card.append(make("p", "missing-label", `Missing (${missing.length}):`));
    const list = make("ul", "ingredient-list");
    missing.forEach(food => list.append(make("li", "chip plain", food)));
    card.append(list);
  } else if (recipe.ingredients && recipe.ingredients.length > 0) {
    card.append(make("p", "missing-label", "You have everything! ✓"));
  }

  // Steps are tucked into a "details" box so the cards stay short.
  if (recipe.steps && recipe.steps.length > 0) {
    const details = make("details");
    details.append(make("summary", "", `Show the ${recipe.steps.length} steps`));
    if (recipe.ingredients && recipe.ingredients.length > 0) {
      details.append(make("p", "", "Ingredients: " + recipe.ingredients.join(", ")));
    }
    const steps = make("ol");
    recipe.steps.forEach(step => steps.append(make("li", "", step)));
    details.append(steps);
    card.append(details);
  }

  if (extraButtons.length > 0) {
    const row = make("div", "btn-row");
    row.append(...extraButtons);
    card.append(row);
  }
  return card;
}

// ---------- step 3: tonight's ideas ----------

function sameRecipe(a, b) {
  return a && b && a.name === b.name;
}

function showTonight() {
  const quest = getQuest();

  // Ingredients from the fridge page.
  haveList.replaceChildren(...quest.ingredients.map(food => make("li", "chip plain", food)));
  needScan.hidden = quest.ingredients.length > 0;
  recipesButton.disabled = quest.ingredients.length === 0;
  recipesButton.textContent = quest.recipes.length > 0 ? "Find different recipes" : "Find recipes";

  recipeResults.replaceChildren(
    ...quest.recipes.map(recipe => {
      const isChosen = sameRecipe(recipe, quest.chosen);
      const buttons = [];

      if (!isChosen) {
        buttons.push(makeButton("Cook this one!", "btn primary", () => chooseRecipe(recipe)));
      } else {
        buttons.push(makeButton("Save to recipe book", "btn primary", () => saveRecipe(recipe)));
        const missingCount = (recipe.missing || []).length;
        if (missingCount > 0) {
          buttons.push(makeButton(`Add ${missingCount} missing to shopping list`, "btn", () => addMissing(recipe)));
        }
      }

      const card = recipeCard(recipe, buttons);
      if (isChosen) {
        card.classList.add("chosen");
        card.querySelector("h3").append(make("span", "badge", "TONIGHT"));
      }
      return card;
    })
  );
}

recipesButton.addEventListener("click", async () => {
  const items = getQuest().ingredients;
  if (items.length === 0) {
    recipeStatus.textContent = "Scan your fridge first.";
    return;
  }

  recipesButton.disabled = true;
  recipeStatus.classList.remove("error");
  recipeStatus.textContent = "Flipping through the recipe book…";

  try {
    const response = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Recipe request failed");
    }
    if (!Array.isArray(data.recipes)) {
      throw new Error("The server returned an unexpected recipe format");
    }

    const quest = getQuest();
    quest.recipes = data.recipes;
    quest.chosen = null;   // new ideas, so pick again
    quest.finished = false;
    saveQuest(quest);

    recipeStatus.textContent = `${data.recipes.length} ideas found! Pick one for tonight.`;
    showTonight();
  } catch (error) {
    console.error(error);
    recipeStatus.textContent = "Couldn’t get recipes. " + error.message;
    recipeStatus.classList.add("error");
  } finally {
    recipesButton.disabled = getQuest().ingredients.length === 0;
  }
});

function chooseRecipe(recipe) {
  const quest = getQuest();
  quest.chosen = recipe;
  quest.reviewed = true; // they clearly got past reviewing
  saveQuest(quest);
  showTonight();
  showToast(`Great pick! ${recipe.name} it is ✓`);
  // Move keyboard focus to the chosen card's first button.
  const chosenButton = recipeResults.querySelector(".recipe-card.chosen button");
  if (chosenButton) chosenButton.focus();
}

// ---------- step 4: save or shop ----------

function finishQuest() {
  const quest = getQuest();
  if (quest.finished) return;
  quest.finished = true;
  saveQuest(quest);
  setTimeout(() => showToast("★ Quest complete! Happy cooking!"), 1600);
}

function saveRecipe(recipe) {
  const book = getBook();
  if (book.some(saved => sameRecipe(saved, recipe))) {
    showToast("That one's already in your recipe book.");
  } else {
    book.unshift(recipe);
    saveBook(book);
    showToast(`Saved ${recipe.name} to your recipe book!`);
    showBook();
  }
  finishQuest();
}

function addToShopping(names) {
  const list = getShopping();
  let added = 0;
  names.forEach(name => {
    const exists = list.some(item => item.name.toLowerCase() === name.toLowerCase());
    if (!exists) {
      list.push({ name, done: false });
      added += 1;
    }
  });
  saveShopping(list);
  showShopping();
  return added;
}

function addMissing(recipe) {
  const added = addToShopping(recipe.missing || []);
  showToast(added > 0 ? `Added ${added} items to your shopping list!` : "Those are already on your list.");
  finishQuest();
}

// ---------- saved recipes ----------

function showBook() {
  const book = getBook();
  if (book.length === 0) {
    savedRecipesBox.replaceChildren(make("p", "hint", "No saved recipes yet. Pick one above and press “Save to recipe book”."));
    return;
  }
  savedRecipesBox.replaceChildren(
    ...book.map((recipe, index) => {
      const buttons = [
        makeButton("Remove", "btn small secondary", () => {
          const updated = getBook();
          updated.splice(index, 1);
          saveBook(updated);
          showBook();
          showToast(`Removed ${recipe.name}.`);
          savedRecipesBox.focus();
        })
      ];
      if ((recipe.missing || []).length > 0) {
        buttons.unshift(makeButton("Add missing to shopping list", "btn small", () => {
          const added = addToShopping(recipe.missing);
          showToast(added > 0 ? `Added ${added} items!` : "Those are already on your list.");
        }));
      }
      return recipeCard(recipe, buttons);
    })
  );
}
savedRecipesBox.tabIndex = -1; // lets us move focus here after removing

// ---------- shopping list ----------

function showShopping() {
  const list = getShopping();
  shoppingEmpty.hidden = list.length > 0;
  clearCheckedButton.hidden = !list.some(item => item.done);

  shoppingListBox.replaceChildren(
    ...list.map((item, index) => {
      const row = make("li");
      const label = make("label", item.done ? "got-it" : "");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = item.done;
      box.addEventListener("change", () => {
        const updated = getShopping();
        updated[index].done = box.checked;
        saveShopping(updated);
        showShopping();
        if (box.checked) showToast(`Got the ${item.name}!`);
        // Put focus back on the same checkbox after redrawing.
        const again = shoppingListBox.querySelectorAll("input")[index];
        if (again) again.focus();
      });
      label.append(box, make("span", "", item.name));
      row.append(label);
      return row;
    })
  );
}

shoppingForm.addEventListener("submit", event => {
  event.preventDefault();
  const name = shoppingInput.value.trim();
  if (!name) return;
  const added = addToShopping([name]);
  showToast(added ? `Added ${name}!` : `${name} is already on the list.`);
  shoppingInput.value = "";
});

clearCheckedButton.addEventListener("click", () => {
  saveShopping(getShopping().filter(item => !item.done));
  showShopping();
  showToast("Cleared ticked items.");
  shoppingInput.focus();
});

// ---------- start ----------

document.addEventListener("quest-reset", showTonight);

// On the laptop, a new phone scan refreshes the ingredient list here too.
if (!isPhone) watchForPhoneScans(() => showTonight());

showTonight();
showBook();
showShopping();
