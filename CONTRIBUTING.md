# Contributing to EPUB Media Overlay Editor

PRs always welcome. If unsure about scope, consult [README](README.md) or just open an issue.

Setup instructions are in the [README](README.md) — same as what you'd run to use the app.

A few pointers:

- **Build, typecheck, lint, and test** before committing — `npm run build`, `npx tsc -b`, `npm run lint`, `npm test`. Smoke tests need the fixture EPUB (see README's Testing section; tests skip with a message if it's absent).
- **Small functions**, one job each.
- Keep commits descriptive, for example `feat: new hotkey`.

PR process:

1. Branch from `main`
2. Make your changes
3. Run tests and make sure everything passes
4. Open a PR with a description of what and why

## A Note on Tooling

Use whatever tools you prefer. As long as you understand the code you're shipping and it passes tests, you're good. Hand-written, LLM-assisted, or dictated by your sleep paralysis demon, I don't judge.

## Reporting Issues

Open a GitHub issue with steps to reproduce and the EPUB you're working with, if you can share one. This tool is built around real talking-book EPUBs. Reproductions beat descriptions.

## Feature Requests & Scope

Read the "What This Doesn't Do" section in the README before opening a PR for a new feature. This is a media-overlay fine-tuning tool, not an EPUB authoring suite, so scope is limited.

## License

Contributions are MIT-licensed, same as the project.
