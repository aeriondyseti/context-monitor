# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `window-probe` function-hook module (`hooks/window-probe.ts`) that caches the
  engine's live context window per session, so `/model` switches are followed.

### Changed

- Context-size thresholds are now 50% / 75% / 90% of the session's context window
  instead of fixed 100k / 150k / 200k tokens. The window is resolved from the
  `CLAUDE_CODE_AUTO_COMPACT_WINDOW` / `autoCompactWindow` override, then the
  window-probe cache, then the transcript's model family (Opus / Fable / Sonnet 1M,
  Haiku 200k), then 200k.

## [0.1.0] - 2026-10-06

### Changed

- Moved out of the [aeriondyseti-plugins](https://github.com/aeriondyseti/aeriondyseti-plugins)
  marketplace repository into its own repository, with history kept.

[Unreleased]: https://github.com/aeriondyseti/context-monitor/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/aeriondyseti/context-monitor/releases/tag/v0.1.0
