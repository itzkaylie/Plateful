# Plateful 🍳 by Byte & Bite

Scan your fridge, choose a recipe, and build a shopping list, all inside a cozy pixel-art kitchen.

**Tonight's quest:** 1. Scan the fridge → 2. Review the ingredients → 3. Choose a recipe → 4. Save it or add the missing items to your shopping list.

## Run it on your computer

You need Node.js 20.6 or newer.

```bash
npm install
cp .env.example .env      # then open .env and paste your key after GEMINI_API_KEY=
npm run dev               # starts the server and reads the key from .env
```

Open http://localhost:3000. (`.env` is in `.gitignore`, so your key won't be uploaded to GitHub.)

The QR code tells your phone to open the address your laptop is using. `localhost` only works on the laptop itself, so to test with your phone, use the Render link (phone cameras need HTTPS anyway).

## Deploy on Render (Web Service)

- **Build command:** `npm install`
- **Start command:** `npm start`
- **Environment variable:** `GEMINI_API_KEY` = your Gemini key (add it in Render → Environment, never in the code)
- Optional: `GEMINI_MODEL` to try a different Gemini model.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Welcome page ("Hello! Byte & Bite", the big Plateful title, Start!) |
| `main.html` | The pixel kitchen hub: tap the fridge or the recipe book, follow tonight's quest |
| `fridge.html` + `fridge.js` | Take or upload a photo, scan it with Gemini, review the ingredients, phone QR code |
| `recipe.html` + `recipe.js` | Recipe ideas, saved recipes, shopping list |
| `shared.js` | QR session ID, saving progress, the quest tracker, pop-up messages, phone-scan check |
| `style.css` | All the shared styles |
| `camera.html` | Old camera link. It now sends you to the fridge page |
| `server.js` | Serves the files and runs `/api/scan`, `/api/latest-scan`, `/api/recipes` |
