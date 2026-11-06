# Validation boundaries

Prepared: 2026-11-05, Japan time. Submission candidate: 0.9.4; native build 12.

| Area | Evidence | Limit |
|---|---|---|
| Hardware baseline | Developer-reported iPhone/G2/R1 core flow on 0.9.2 | 0.9.4 is not freshly device-verified |
| Live data | Historical schedule, venue/topic searches, abstract and AI generation | No fresh live AWS tests for this candidate |
| Reservation | Earlier write verified in official schedule; mocked write/read and replay regressions | No new real booking or cancellation claim |
| Markdown | Cached Markdown fixture normalized before paginated text/Canvas output | Common Markdown, not a full rich-text parser |
| Keyword UI | Three-term cap, explicit Run Dive, continuation/row hints, function-word filtering | Rule-based candidates; no semantic extraction |
| AI filter | Daily/training/available excluded; explicit AI/Bedrock fixture included | No relevance/recall benchmark |
| Refresh | Ring menu reachable; schedule + catalog fetched; existing hold and Web checks pass | Revised initial-only personal refresh policy not implemented |
| Native sign-out | Source adds Safari website-data clearing with an attempt guard | Requires Xcode compilation and iPhone login test |
| Automated checks | All six suites pass, including new submission regressions | Mocked upstream/SDK; no native compiler |
| Source/template | Relay and AI Lambda embedded source equals index.js | Deployment must be performed by the developer |

```bash
npm ci
npm run release:check
```

Tests generate ignored root PNGs from synthetic fixtures. Curated docs/images previews contain no attendee data. The live URL and TestFlight status must not be inferred from this archive. See RELEASE-0.9.4.md for deployment and recording checks.
