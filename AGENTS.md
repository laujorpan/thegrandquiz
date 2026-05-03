# AGENTS.md

Shared context for any AI coding assistant working in this repository.

## Project Overview

Static quiz game built with plain HTML, CSS, and vanilla JavaScript. There is no build step, no framework, and no package dependency required for the app itself.

The project is served as static files and loads `questions.csv` with `fetch()`, so it must run over HTTP rather than `file://`.

## Running Locally

Serve the repository root with any static HTTP server:

```bash
npx serve .
# or
npx http-server . -p 8000
```

Open `http://localhost:8000`.

When running on `localhost` or `127.0.0.1`, the page injects a floating theme selector. Themes can also be forced with `?theme=<name>`.

## Repository Structure

- `index.html` — Single HTML entry point. Contains all visible screens, theme bootstrapping, welcome prank modals, localhost-only theme switcher, and global config fallbacks before loading `config.js` and `quiz.js`.
- `quiz.js` — Main game logic. Handles CSV parsing, question shuffling, the intro captcha sequence, answer checking, review screens, and result/prize logic.
- `style.css` — Base shared styles for layout, cards, buttons, captcha grid, modals, review UI, and responsive behavior.
- `themes/*.css` — Theme overrides. These files restyle the experience much more aggressively than simple token swaps, so preserve each theme’s visual language.
- `questions.csv` — Semicolon-delimited question bank with correct answers stored as comma-separated option letters.
- `config.example.js` — Template for local `config.js`.
- `assets/logo.png` — Main logo used on start and result screens.
- `assets/captcha/` — 12 image panels used by the fake captcha flow shown before the quiz questions.

## Runtime Flow

The app boot sequence is:

1. `DOMContentLoaded` triggers `init()` in `quiz.js`.
2. `init()` fetches and parses `questions.csv`.
3. `bindEvents()` wires all buttons once the CSV is loaded successfully.
4. The user starts a session with `startGame()`.

The play flow is:

1. Start screen.
2. Intro fake captcha with 3 forced-fail steps.
3. `QUESTIONS_COUNT` random questions from the CSV.
4. Result screen.
5. Review screen, with content depending on whether the user won.

Important: the captcha is intentionally unwinnable by user action. Pressing `Confirmar` always opens a modal, advances the internal `captchaStep`, and eventually leads to the first quiz question after the third message.

## Screen Model

`index.html` keeps all screens mounted at once as `.screen` containers; only the one with `.active` is visible.

Defined screens:

- `screen-start`
- `screen-question`
- `screen-feedback`
- `screen-result`
- `screen-review`

Note: `screen-feedback` markup and helper code still exist, but the current gameplay flow goes directly from one question to the next and does not show per-question feedback.

## Data Model

`quiz.js` uses a small set of globals:

- `allQuestions` — Full parsed CSV pool.
- `sessionQuestions` — Random subset used in the current game.
- `currentIndex` — Current question index inside `sessionQuestions`.
- `score` — Number of exact matches answered correctly.
- `answers` — Per-question history for the current session.
- `canSeeAllQuestions` — Controls whether review shows the full bank or only the user’s answers.
- `captchaStep` — Current position in the 3-step captcha sequence.

Parsed question shape:

```js
{
  id: '1',
  question: '...',
  options: ['A text', 'B text', 'C text', 'D text'],
  correct: ['A', 'C']
}
```

## CSV Contract

`questions.csv` must:

- Use `;` as the field separator.
- Start with the header `id;question;option_a;option_b;option_c;option_d;correct`.
- Provide exactly four options per row.
- Store correct answers in `correct` as comma-separated letters such as `A` or `A,C`.
- Contain at least `QUESTIONS_COUNT` valid rows.

`parseCSV()` is intentionally simple and does not support quoted semicolons or multiline fields.

## Game Rules

Main constants:

- `QUESTIONS_COUNT` — `window.QUIZ_QUESTIONS_COUNT || 10`
- `MIN_CORRECT` — `window.QUIZ_MIN_CORRECT || 9`
- `DISCOUNT_CODE` — `window.PRIZE_CODE || '[ CÓDIGO NO CONFIGURADO ]'`
- `LS_KEY_WON` — `'ikerQuiz_hasWon'`

Answer evaluation is strict:

- A question is correct only if the selected set matches the `correct` set exactly.
- Selecting nothing triggers a warning box first; confirming still records the answer as incorrect.
- Winning requires `score >= MIN_CORRECT`.

Prize behavior:

- First win stores `ikerQuiz_hasWon=true` in `localStorage` and reveals the configured prize code.
- Later wins do not reveal the code again.

Review behavior:

- Winners can review the full `allQuestions` bank.
- Non-winners can only review the answers from their own session.

## Configuration

The real prize code is not committed. Local configuration lives in `config.js`, which is expected to be gitignored.

Typical setup:

```bash
cp config.example.js config.js
```

Supported globals:

```js
window.PRIZE_CODE = 'REAL-CODE';
window.QUIZ_QUESTIONS_COUNT = 10;
window.QUIZ_MIN_CORRECT = 9;
```

`index.html` initializes these globals to `null` before loading `config.js`, so the app keeps working if the file is missing.

## Themes

Available themes:

- `default`
- `grand-prix`
- `nintendo`
- `fifa`

Theme loading happens in two places inside `index.html`:

- Early `<head>` script that applies `themes/<name>.css` from the `theme` query param.
- Localhost-only floating selector near the end of `<body>`.

When adding or renaming a theme, update both theme name lists in `index.html`.

## UX Details Worth Preserving

- Two prank welcome modals are shown immediately on page load: cookies first, then partner code.
- The start/result screens use `assets/logo.png`.
- The question screen doubles as the captcha screen by switching copy, layout class names, and button label.
- Clipboard copy is implemented both for the prize code and the fake partner code.

## Working Guidelines For Assistants

- Keep the app dependency-free and framework-free.
- Prefer small direct edits over abstractions; this codebase is intentionally simple.
- Preserve Spanish user-facing copy unless the task explicitly requires rewriting it.
- If changing theme support, update both the early theme loader and localhost selector.
- If changing game flow, verify the corresponding screen markup already exists in `index.html`.
- If documenting deployment, do not point to `docs/deployment.md` unless that file actually exists.
