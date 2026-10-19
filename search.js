// search.js — the Find Recipes page.
// Sends the search to our own server (POST /api/search-recipes), which asks
// Tavily web search. The Tavily key stays on the server; this file never sees it.
// Each result links to the original recipe page, and can be saved
// (title + link only) into the recipe book.
// (getBook, saveBook, getQuest and showToast come from shared.js.)

const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const searchButton = document.querySelector("#search-button");
const searchStatus = document.querySelector("#search-status");
const searchResults = document.querySelector("#search-results");
const retryRow = document.querySelector("#retry-row");
const retryButton = document.querySelector("#retry-button");
const fridgeExample = document.querySelector("#fridge-example");

let lastQuery = "";

// ---------- small helpers ----------

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function isSaved(url) {
  return getBook().some(saved => saved.url === url);
}

// The Plateful art used when a result has no picture (or it fails to load).
function fallbackArt() {
  const box = make("div", "search-card-art search-card-fallback");
  const img = document.createElement("img");
  img.className = "pixel";
  img.src = "recipe book.png";
  img.alt = "";
  box.append(img);
  return box;
}

// ---------- one result card ----------

function resultCard(result) {
  const card = make("article", "search-card");

  // Picture: the search thumbnail if there is one, otherwise our pixel art.
  if (result.image) {
    const box = make("div", "search-card-art");
    const img = document.createElement("img");
    img.src = result.image;
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => box.replaceWith(fallbackArt()));
    box.append(img);
    card.append(box);
  } else {
    card.append(fallbackArt());
  }

  const body = make("div", "search-card-body");
  body.append(make("p", "search-card-site", result.site));
  body.append(make("h3", "search-card-title", result.title));
  if (result.snippet) body.append(make("p", "search-card-snippet", result.snippet));

  const row = make("div", "btn-row");

  // Opens the original recipe in a new tab.
  const open = make("a", "btn primary small");
  open.href = result.url;
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  open.textContent = `Open on ${result.site} ↗`;
  open.setAttribute("aria-label", `Open “${result.title}” on ${result.site} (opens in a new tab)`);

  const save = make("button", "btn secondary small");
  save.type = "button";
  const showSaved = () => {
    save.textContent = "Saved ✓";
    save.disabled = true;
  };
  if (isSaved(result.url)) {
    showSaved();
  } else {
    save.textContent = "Save to recipe book";
    save.addEventListener("click", () => {
      // Save only the title, link and site name, not the recipe itself.
      const book = getBook();
      if (!book.some(saved => saved.url === result.url)) {
        book.unshift({ name: result.title, url: result.url, site: result.site });
        saveBook(book);
      }
      showSaved();
      showToast("Saved to your recipe book! ✓");
    });
  }

  row.append(open, save);
  body.append(row);
  card.append(body);
  return card;
}

// ---------- loading placeholders ----------

function showLoading() {
  const placeholders = [1, 2, 3].map(() => {
    const card = make("div", "search-card search-card-loading");
    card.setAttribute("aria-hidden", "true");
    card.append(make("div", "search-card-art"), make("div", "search-card-body"));
    return card;
  });
  searchResults.replaceChildren(...placeholders);
}

// ---------- the search itself ----------

async function runSearch(query) {
  query = query.trim();
  if (query.length < 2) {
    searchStatus.textContent = "Type at least 2 letters to search.";
    searchStatus.classList.add("error");
    searchInput.focus();
    return;
  }

  lastQuery = query;
  searchInput.value = query;

  // Put the search in the address bar, so Back/refresh keeps the results.
  const pageUrl = new URL(window.location.href);
  pageUrl.searchParams.set("q", query);
  history.replaceState(null, "", pageUrl);

  searchButton.disabled = true;
  retryRow.hidden = true;
  searchStatus.classList.remove("error");
  searchStatus.textContent = `Searching the web for “${query}”…`;
  showLoading();

  try {
    const response = await fetch("/api/search-recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Search failed (${response.status})`);

    if (data.results.length === 0) {
      searchResults.replaceChildren();
      searchStatus.textContent = `No recipe pages found for “${query}”. Try fewer or simpler words, like “pancakes”.`;
      return;
    }

    searchResults.replaceChildren(...data.results.map(resultCard));
    searchStatus.textContent = `Found ${data.results.length} recipe pages for “${query}”. Nice find!`;
  } catch (error) {
    console.error(error);
    searchResults.replaceChildren();
    searchStatus.textContent = error.message;
    searchStatus.classList.add("error");
    retryRow.hidden = false;
  } finally {
    searchButton.disabled = false;
  }
}

searchForm.addEventListener("submit", event => {
  event.preventDefault(); // stop the page from reloading
  runSearch(searchInput.value);
});

retryButton.addEventListener("click", () => runSearch(lastQuery));

// Example buttons fill the box and search right away.
document.querySelector("#search-examples").addEventListener("click", event => {
  const button = event.target.closest("button[data-query]");
  if (button) runSearch(button.dataset.query);
});

// If the fridge was scanned, offer a search with a few of those ingredients.
const fridgeItems = getQuest().ingredients.slice(0, 3);
if (fridgeItems.length > 0) {
  const query = fridgeItems.join(" ");
  fridgeExample.dataset.query = query;
  fridgeExample.textContent = `🧊 From my fridge: ${fridgeItems.join(", ")}`;
  fridgeExample.hidden = false;
}

// Opened with ?q=... (for example after pressing Back)? Search straight away.
const startQuery = new URLSearchParams(window.location.search).get("q");
if (startQuery) runSearch(startQuery);
