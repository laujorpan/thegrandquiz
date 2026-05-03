# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Primary Reference

Read [AGENTS.md](./AGENTS.md) first. It contains the current project structure, runtime flow, configuration model, theme handling, captcha behavior, and repository-specific constraints.

## Claude-Specific Notes

- This is a static app: no build, no bundler, no framework.
- Serve the project over HTTP when testing because `quiz.js` fetches `questions.csv`.
- Preserve the plain-JS style of the codebase unless the user explicitly requests a structural rewrite.
- Keep user-facing text in Spanish by default.
- When updating theme support, change both theme arrays in `index.html`.
- When updating game flow, verify whether the screen already exists in `index.html` before adding new structure.
- `screen-feedback` currently exists in markup and JS helpers, but it is not part of the active gameplay path.
- The intro captcha flow is intentional and always fails forward after three modal steps before the first quiz question.

## Local Config

`config.js` is expected locally and should not be committed. Use [config.example.js](./config.example.js) as the template.
