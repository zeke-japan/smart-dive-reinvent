# Smart Dive 0.9.4 — submission candidate

Prepared 2026-11-05 (Japan time). Cockpit 0.9.4; Smart Dive Connect 0.9.4, build 12.

## Changes

- Request plain-text explanations for standard and Keyword Dive; use a new AI cache namespace for the revised prompt.
- Normalize common Markdown headings, emphasis, inline code, fences and links before cockpit pagination. Existing cached text is normalized too. Preview and G2 tiles share the same output.
- Exclude common function words such as and/the/how from keyword candidates; retain short technical terms such as AI and ML. Keep the three-term cap, visible row range, continuation hint and explicit Run Dive row.
- Use word boundaries for the AI topic filter so daily/training/available do not match merely because they contain the letters ai. This is still a local text filter.
- Add Refresh to the R1 menu. It returns Home, reloads personal schedule and starts a complete catalog reload. Current-list hold/Web refresh remains supported.
- Refresh personal schedule after a reservation attempt while keeping the result screen visible. A refresh failure asks the user to check the official schedule; it does not retry a reservation.
- Connect manual sign-out now clears its SFSafariViewController website data as well as in-memory tokens. Normal sign-in reset does not clear browser data.
- Update connected-state operation guidance, distinguish abstract-based AI Dive from general-knowledge Keyword Dive, and align visible version labels.

## Verification

Six automated suites pass with mocked Events/Bedrock/Even bridges and real Canvas PNG encoding. Added regressions cover cached Markdown rendering, keyword noise, the R1 Refresh entry and AI filter false matches. Existing tests cover explicit confirmation, repeated taps, unknown outcomes, pairing integrity, AI isolation and no booking from Dive. Generated Lambda templates embed the current source.

Native sign-out uses Apple's SFSafariViewController.DataStore clearWebsiteData API. This environment has no Xcode/iPhone: no native build or fresh real-device success is claimed. A local source review does not replace device testing or a security audit.

## Install the same candidate used for recording

For an existing deployment, in this extracted repository on the developer's Mac:

```bash
npm ci
npm run release:check
bash hosting/deploy.sh
open SmartDiveAuth.xcodeproj
```

The hosting script updates the existing relay and hosting stacks, retaining their URLs. It uses the current AWS CLI identity. Do not delete/recreate stacks. For first deployment, follow README's private artifact-bucket setup instead.

Set Xcode Team/Bundle Identifier and install build 12 on the iPhone. Set your relay URL under Advanced / development (the public source intentionally has no default). Close and reopen the Even cockpit after deploying; a full reload discards its in-memory connection, so create a fresh connection code and reconnect. Confirm the phone page says Cockpit 0.9.4.

## Recording checks

1. Connect: manual Sign out and clear data completes, then a fresh code and Builder ID login work. This is local data clearing, not global token revocation.
2. Schedule and Near venue load; AI filters show plausible results for the selected topic.
3. Open one dated session, read its abstract, run Summary, then choose Keyword Dive.
4. See row range/More below, select 1–3 meaningful terms, scroll to Run Dive and explicitly run it.
5. Check that headings/bold/backticks are absent and page numbers still match the displayed text.
6. Return to the menu, choose Refresh and confirm the app is usable afterwards.
7. Reservation: Cancel is the initial choice. Only Confirm can write. Book a seat only if genuinely intended; otherwise demonstrate cancelling the confirmation. Check the official schedule for any real write.

The video should identify the iPhone preview, not claim it is footage through the lenses. Real hardware evidence remains the developer's earlier 0.9.2 observations until this candidate is tested. Keyword Dive uses general model knowledge with session context and no web search. No AI recommendation, GPS navigation, automatic booking, reservation cancellation or TestFlight distribution is added.

## Publication

This archive is the common source for the demo and GitHub. It excludes .git, dependencies, signing state, local configuration and personal data. No GitHub repository has been created or pushed by this preparation. Follow PUBLISHING.md after owner approval. Add the actual video/repository URLs only after publication.
