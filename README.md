# Orator: Track C Dashboard

A self-contained static implementation of the AI Debate / Interview Coach dashboard for Rohan's Track C work.

## Run

No build step is required. Open `index.html` in a browser, or serve this folder with any static web server.

## Included

- Local email/password login state using `localStorage`
- Dashboard overview with score, sessions, streak, and filler-word stats
- Fake session data matching the Track A contract
- Progress trend chart and voice-profile radar chart
- Session history and detailed coaching notes
- Downloadable PDF session reports
- Milestone badges and practice rhythm

The fake `fakeSessions` array in `app.js` is the integration point for a later `GET /sessions` call.
