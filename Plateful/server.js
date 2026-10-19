// Plateful server
// ---------------
// 1. Serves the web pages, styles, scripts and pixel-art images.
// 2. Talks to Gemini for the fridge scan and the recipe ideas.
//    The Gemini key is read from the GEMINI_API_KEY environment variable,
//    so it stays on the server and never reaches the browser.
//
// API routes (same as before):
//   POST /api/scan         photo in, {"items":[...]} out (saved for this session)
//   GET  /api/latest-scan  the last scan saved for this session (or null)
//   POST /api/recipes      {"items":[...]} in, {"recipes":[...]} out

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// Which model to use. You can change it on Render with GEMINI_MODEL if needed.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

// Biggest photo we accept (in bytes). The browser shrinks photos before
// uploading, so normal photos are far below this.
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

// The only files the browser is allowed to download.
// (An allow-list means server.js, package.json, etc. are never served.)
const files = {
  "/": "index.html",
  "/index.html": "index.html",
  "/main.html": "main.html",
  "/fridge.html": "fridge.html",
  "/recipe.html": "recipe.html",
  "/camera.html": "camera.html",
  "/style.css": "style.css",
  "/shared.js": "shared.js",
  "/fridge.js": "fridge.js",
  "/recipe.js": "recipe.js",
  "/background.png": "background.png",
  "/background01.jpg": "background01.jpg",
  "/background02.png": "background02.png",
  "/fridgeclosed.png": "fridgeclosed.png",
  "/recipe book.png": "recipe book.png",
  "/camera.png": "camera.png"
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg"
};

// Scan results, remembered per QR session ID.
// This lives in memory, so it resets when the server restarts.
const latestScans = new Map();
const MAX_SESSIONS = 500;

function saveScan(sessionId, scanResult) {
  latestScans.delete(sessionId);
  latestScans.set(sessionId, scanResult);
  // Forget the oldest session if we are remembering too many.
  if (latestScans.size > MAX_SESSIONS) {
    latestScans.delete(latestScans.keys().next().value);
  }
}

// ---------- small helpers ----------

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(data));
}

// Collects the request body. If it's bigger than maxBytes, it stops
// keeping the data and fails with "TOO_BIG" once the upload ends.
function readBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", chunk => {
      size += chunk.length;
      if (size <= maxBytes) chunks.push(chunk);
    });
    request.on("end", () => {
      if (size > maxBytes) reject(new Error("TOO_BIG"));
      else resolve(Buffer.concat(chunks));
    });
    request.on("error", reject);
  });
}

// Gemini sometimes wraps JSON in ```json ... ``` fences. Remove them, then parse.
function parseGeminiJson(text) {
  const cleanedText = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleanedText);
}

// Keeps only non-empty strings, trimmed and not too long.
function cleanList(list, maxItems, maxLength = 80) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(item => typeof item === "string")
    .map(item => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

// Sends a request to Gemini and returns the reply text.
async function askGemini(input) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set on the server.");
  }
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const result = await ai.interactions.create({ model: MODEL, input });
  return result.output_text;
}

// ---------- API route handlers ----------

async function handleScan(request, response) {
  const sessionId = request.headers["x-session-id"];
  if (!sessionId) {
    sendJson(response, 400, { error: "Missing session ID." });
    return;
  }

  let photo;
  try {
    photo = await readBody(request, MAX_PHOTO_BYTES);
  } catch (error) {
    sendJson(response, 413, { error: "That photo is too big. Try a smaller one." });
    return;
  }
  if (photo.length === 0) {
    sendJson(response, 400, { error: "No photo was sent." });
    return;
  }

  // Some phones send no type. JPEG is the safest guess.
  const contentType = request.headers["content-type"] || "";
  const mimeType = contentType.startsWith("image/") ? contentType : "image/jpeg";

  try {
    const text = await askGemini([
      {
        type: "text",
        text: 'Identify the visible food items in this fridge photo. Reply only with JSON in this format: {"items":["item one","item two"]}. Don’t guess items you can’t see clearly.'
      },
      {
        type: "image",
        data: photo.toString("base64"),
        mime_type: mimeType
      }
    ]);

    const parsed = parseGeminiJson(text);
    const scanResult = { items: cleanList(parsed.items, 40) };
    saveScan(sessionId, scanResult);
    sendJson(response, 200, scanResult);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "The AI scan failed. Check the server terminal." });
  }
}

function handleLatestScan(request, response) {
  const sessionId = request.headers["x-session-id"];
  sendJson(response, 200, latestScans.get(sessionId) || null);
}

async function handleRecipes(request, response) {
  let items;
  try {
    const body = await readBody(request, 100 * 1024);
    items = cleanList(JSON.parse(body.toString("utf8")).items, 50);
  } catch (error) {
    sendJson(response, 400, { error: "Send ingredients as {\"items\":[...]}." });
    return;
  }
  if (items.length === 0) {
    sendJson(response, 400, { error: "Add at least one ingredient first." });
    return;
  }

  try {
    const text = await askGemini(
      `Suggest 3 simple recipes using these ingredients: ${items.join(", ")}.
For each recipe, list every ingredient it needs, and separately list the ones that are NOT in my list above (pantry basics like salt, pepper, oil and water don't count as missing).
Return only JSON in this format:
{"recipes":[{"name":"Recipe name","ingredients":["ingredient"],"missing":["ingredient I don't have"],"steps":["Step one","Step two"]}]}`
    );

    const parsed = parseGeminiJson(text);
    const recipes = (Array.isArray(parsed.recipes) ? parsed.recipes : [])
      .filter(recipe => recipe && typeof recipe.name === "string")
      .map(recipe => ({
        name: recipe.name.trim().slice(0, 100),
        ingredients: cleanList(recipe.ingredients, 30),
        missing: cleanList(recipe.missing, 30),
        steps: cleanList(recipe.steps, 20, 500) // steps are sentences, so allow them to be longer
      }));

    if (recipes.length === 0) throw new Error("Gemini returned no recipes.");
    sendJson(response, 200, { recipes });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Recipe generation failed. Check the server terminal." });
  }
}

// ---------- static files (pages, CSS, JS, images) ----------

function serveFile(request, response) {
  let pathname;
  try {
    // decodeURIComponent turns "recipe%20book.png" back into "recipe book.png".
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch (error) {
    pathname = "";
  }

  const fileName = files[pathname];
  if (!fileName || (request.method !== "GET" && request.method !== "HEAD")) {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("Page not found");
    return;
  }

  fs.readFile(path.join(__dirname, fileName), (error, contents) => {
    if (error) {
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end("Could not read the file");
      return;
    }
    const type = contentTypes[path.extname(fileName)] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": type });
    response.end(request.method === "HEAD" ? undefined : contents);
  });
}

// ---------- the server ----------

const server = http.createServer((request, response) => {
  const pathname = request.url.split("?")[0];

  if (request.method === "POST" && pathname === "/api/scan") {
    handleScan(request, response);
    return;
  }
  if (request.method === "GET" && pathname === "/api/latest-scan") {
    handleLatestScan(request, response);
    return;
  }
  if (request.method === "POST" && pathname === "/api/recipes") {
    handleRecipes(request, response);
    return;
  }
  serveFile(request, response);
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Plateful is running: http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn("Heads up: GEMINI_API_KEY is not set, so scans and recipes will fail.");
  }
});
