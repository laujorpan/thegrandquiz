# AGENTS.md

Shared context for any AI coding assistant working in this repository.

## Project Overview

A static, vanilla JS/HTML/CSS quiz game ("El Gran Quiz de Darwinex"). No build step, no framework, no dependencies — just files served over HTTP.

## Running Locally

The quiz uses `fetch()` to load `questions.csv`, so it must be served over HTTP (not `file://`):

```bash
npx serve .
# or
npx http-server . -p 8000
```

Open: http://localhost:8000

A theme switcher appears automatically on localhost — use `?theme=<name>` in the URL to test themes.

## Architecture

- `index.html` — All 5 screens (start, question, feedback, result, review) defined as `.screen` divs; only the `.active` one is visible. Inline script applies the theme CSS at page load to avoid flash.
- `quiz.js` — All game logic. Module-free, plain JS. Key globals: `allQuestions` (full pool from CSV), `sessionQuestions` (10 random per game), `answers` (per-game history). Flow: `init()` → fetches CSV → `bindEvents()` → `startGame()` on button click.
- `style.css` — Base styles with CSS variables (`--accent`, `--dark`, `--light`, etc.). Darwinex brand colors: `#D8F937` (lime accent), `#3B3B3B` (dark).
- `themes/` — Override CSS variables per theme (`default.css`, `grand-prix.css`, `nintendo.css`, `fifa.css`). Themes only change CSS variables, not structure.
- `questions.csv` — Semicolon-delimited. Header: `id;question;option_a;option_b;option_c;option_d;correct`. The `correct` column is comma-separated letters (e.g. `A,C` for multi-select). Must have ≥10 rows.

## Key Game Rules (in quiz.js constants)

- `QUESTIONS_COUNT` — questions drawn per session; reads `window.QUIZ_QUESTIONS_COUNT` from `config.js`, default `10`
- `MIN_CORRECT` — threshold to win; reads `window.QUIZ_MIN_CORRECT` from `config.js`, default `9`
- `LS_KEY_WON = 'ikerQuiz_hasWon'` — localStorage flag; prize code shown only on first win
- `DISCOUNT_CODE` — reads `window.PRIZE_CODE` (set by `config.js`) or falls back to `'[ CÓDIGO NO CONFIGURADO ]'`
- The total question pool size is derived dynamically from `questions.csv` (no hardcoded count)

## Prize Code Configuration

The prize code is **not stored in the repository**. It lives in `config.js` (gitignored):

```js
window.PRIZE_CODE = 'THE-REAL-CODE';
```

`index.html` sets `window.PRIZE_CODE = null` before loading `config.js`, so the quiz degrades gracefully if the file is absent. To set up a local copy:

```bash
cp config.example.js config.js
# edit config.js with the real code
```

In CI/CD (e.g. GitHub Actions), generate the file from a secret before deploying — see [deployment.md](docs/deployment.md).

## Themes

Themes are loaded via `?theme=<name>` query param. Available: `default`, `grand-prix`, `nintendo`, `fifa`. Adding a new theme: create a CSS file in `themes/` that overrides CSS variables, then add the name to both `THEMES` arrays in `index.html`.
