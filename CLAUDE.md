# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Primary Reference

Read [AGENTS.md](./AGENTS.md) first. It contains the current project structure, runtime flow, configuration model, theme handling, captcha behavior, and repository-specific constraints.

## Claude-Specific Notes

- This is a plain frontend plus Cloudflare Worker backend: no frontend build, no bundler, no framework.
- Use `npm run dev` / Wrangler when testing secure Workers mode. `npx http-server . -p 8000` is also supported for static fallback mode.
- Preserve the plain-JS style of the codebase unless the user explicitly requests a structural rewrite.
- Keep user-facing text in Spanish by default.
- When updating theme support, change both theme arrays in `index.html`.
- When updating game flow, verify whether the screen already exists in `index.html` before adding new structure.
- `screen-feedback` currently exists in markup and JS helpers, but it is not part of the active gameplay path.
- The intro captcha flow is intentional and always fails forward after three modal steps before the first quiz question.

## Local Config

`config.js` is only for public static fallback mode and is ignored by Cloudflare assets. Use Cloudflare Secrets for real `PRIZE_CODE`, Wrangler vars for non-secret quiz config, and KV for the secure question bank.

The committed `questions.csv` is the public demo bank. The real Cloudflare question bank should stay outside the repository and be exported locally into `/tmp/thegrandquiz-questions.json` before upload to KV.
