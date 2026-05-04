# AGENTS.md

Shared context for any AI coding assistant working in this repository.

## Project Overview

Quiz game built with plain HTML, CSS, vanilla JavaScript, and a Cloudflare Worker backend. There is no frontend build step or app framework. Wrangler is used only for local Worker development and deployment.

The app supports two runtime modes:

- **Workers mode**: sensitive logic is outside the browser.
- **Static mode**: if `/api/health` is unavailable, the browser falls back to `questions.csv` and client-side validation so GitHub Pages and `http-server` still work.

In Workers mode:

- the browser does not fetch `questions.csv`;
- answers are validated by `worker.js`;
- the prize code lives in a Cloudflare Secret;
- the deploy-time question bank lives in Cloudflare KV.

Static mode is functional but not secure. Do not treat static-mode questions, answers, or prize codes as secret. The committed `questions.csv` is the public demo bank; the real Cloudflare question bank should be kept outside the repository.

## Running Locally

Static mode:

```bash
npx http-server . -p 8000
```

Workers mode:

```bash
npm install
npm run dev
```

Before the app works locally, `wrangler.jsonc` needs real KV IDs or preview IDs, `PRIZE_CODE` must be configured, and the `questions` key must exist in `QUESTIONS_KV`.

Export and upload questions:

```bash
npm run questions:export -- /ruta/privada/questions-real.csv /tmp/thegrandquiz-questions.json
npx wrangler kv key put questions --path /tmp/thegrandquiz-questions.json --binding QUESTIONS_KV
```

When running on `localhost` or `127.0.0.1`, the page injects a floating theme selector. Themes can also be forced with `?theme=<name>`.

## Repository Structure

- `index.html` — Single HTML entry point. Contains all visible screens, theme bootstrapping, welcome prank modals, and localhost-only theme switcher.
- `quiz.js` — Browser-side game UI. Handles captcha flow, rendering, API calls, static fallback, review display, and result screens. It must not validate answers locally in Workers mode.
- `worker.js` — Cloudflare Worker backend. Serves allowed static assets, blocks sensitive paths, creates sessions, validates answers, reads questions from KV, and returns the prize only after a win.
- `wrangler.jsonc` — Cloudflare Worker, Static Assets, KV, and non-secret runtime config.
- `style.css` — Base shared styles for layout, cards, buttons, captcha grid, modals, review UI, and responsive behavior.
- `themes/*.css` — Theme overrides. These files restyle the experience much more aggressively than simple token swaps, so preserve each theme’s visual language.
- `questions.csv` — Semicolon-delimited public demo question bank for static mode. The definitive sensitive bank should be kept outside the repo and exported to KV locally.
- `scripts/export-questions.mjs` — Converts the CSV into JSON suitable for KV.
- `config.example.js` — Optional static-mode template. `config.js` is loaded by `index.html` for GitHub Pages/http-server, but is ignored by Cloudflare assets.
- `assets/logo.png` — Main logo used on start screen.
- `assets/captcha/` — 12 image panels used by the fake captcha flow shown before the quiz questions.

## Runtime Flow

The app boot sequence is:

1. `DOMContentLoaded` triggers `init()` in `quiz.js`.
2. `init()` calls `/api/health` to detect Workers mode.
3. If `/api/health` fails, `initStaticMode()` loads `questions.csv`.
4. `bindEvents()` wires all buttons.
5. The user starts a session with `startGame()`.

The play flow is:

1. Start screen.
2. Workers mode: `POST /api/session/start` creates a backend session and returns questions without correct answers.
3. Static mode: `startGame()` shuffles questions loaded from `questions.csv`.
4. Intro fake captcha with 3 forced-fail steps.
5. Browser renders the session questions.
6. Workers mode: each answer goes to `POST /api/session/answer`.
7. Static mode: each answer is evaluated in `quiz.js`.
8. Workers mode: `GET /api/session/result` returns score, review data, and the prize code only when applicable.
9. Result screen.
10. Review screen, with content depending on whether the user won.

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

Browser-side globals in `quiz.js`:

- `sessionId` — Backend session ID returned by `/api/session/start`.
- `runtimeMode` — Either `'worker'` or `'static'`.
- `allQuestions` — Full parsed CSV pool used only in static mode.
- `sessionQuestions` — Session questions without correct answers.
- `currentIndex` — Current question index inside `sessionQuestions`.
- `score` — Score reported by the backend.
- `answers` — Client-side selected-answer history for the current session.
- `reviewItems` — Review payload returned by `/api/session/result`.
- `canSeeAllQuestions` — Controls review copy and whether review is full-bank or session-only.
- `quizConfig` — Question count and minimum correct values reported by backend.
- `captchaStep` — Current position in the 3-step captcha sequence.

Question payload sent to the browser during play:

```js
{
  id: '1',
  question: '...',
  options: ['A text', 'B text', 'C text', 'D text']
}
```

Correct answers should only appear in the result/review payload after the game is complete in Workers mode. Static mode necessarily has correct answers in browser memory.

## CSV Contract

`questions.csv` must:

- Use `;` as the field separator.
- Start with the header `id;question;option_a;option_b;option_c;option_d;correct`.
- Provide exactly four options per row.
- Store correct answers in `correct` as comma-separated letters such as `A` or `A,C`.
- Contain at least `QUIZ_QUESTIONS_COUNT` valid rows.

The CSV parser is intentionally simple and does not support quoted semicolons or multiline fields.

Private local question files such as `questions.real.csv`, `questions.private.csv`, `questions.production.csv`, `private/`, and `secrets/` are ignored by git.

## Game Rules

Runtime config:

- `QUIZ_QUESTIONS_COUNT` — Wrangler var, default `10`.
- `QUIZ_MIN_CORRECT` — Wrangler var, default `9`.
- `PRIZE_CODE` — Cloudflare Secret.
- Static fallback uses `window.QUIZ_QUESTIONS_COUNT`, `window.QUIZ_MIN_CORRECT`, and `window.PRIZE_CODE` from optional public `config.js`.
- `LS_KEY_WON` — Browser key `'ikerQuiz_hasWon'` kept for existing first-win UI behavior.

Answer evaluation is strict. It happens in `worker.js` in Workers mode and in `quiz.js` in static mode:

- A question is correct only if the selected set matches the `correct` set exactly.
- Selecting nothing triggers a warning box first; confirming still records the answer as incorrect.
- Winning requires `score >= QUIZ_MIN_CORRECT`.

Prize behavior:

- First backend-visible win returns `PRIZE_CODE` and sets an HttpOnly cookie.
- Later wins do not reveal the code again while that cookie is present.

Review behavior:

- Winners can review the full question bank.
- Non-winners can only review the answers from their own session.

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
- The start/result screens use logo assets from `assets/`.
- The question screen doubles as the captcha screen by switching copy, layout class names, and button label.
- Clipboard copy is implemented both for the prize code and the fake partner code.

## Working Guidelines For Assistants

- Keep the frontend dependency-free and framework-free.
- Prefer small direct edits over abstractions; this codebase is intentionally simple.
- Preserve Spanish user-facing copy unless the task explicitly requires rewriting it.
- Do not move answer validation or prize-code access back into browser JavaScript for Workers mode.
- Keep the static fallback working, but do not confuse it with the secure deployment path.
- If changing theme support, update both the early theme loader and localhost selector.
- If changing game flow, verify the corresponding screen markup already exists in `index.html`.
- If documenting deployment, point to `docs/deployment.md`.
