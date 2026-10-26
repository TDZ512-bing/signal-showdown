# Signal Showdown

A real multiplayer science-estimation game for 2–8 players. React + TypeScript + Vite, with a Node.js/Express/Socket.IO server. No player accounts or external API keys are required.

## Play

1. Enter a nickname and create a room.
2. Share the six-character room code or copy the invite link.
3. A second player opens the same site on another browser or device and joins.
4. The host starts. Everyone gets the same question and a server-controlled 30-second deadline.
5. Submit one positive estimate per round. Scientific notation such as `3e8` is supported. Answers lock on submission.
6. After all connected players answer or the deadline passes, the server reveals answers and scores for 12 seconds.
7. After three rounds, the highest total wins. Ties share the victory. The host can return everyone to the lobby for a rematch.

Points = round(1000 × min(estimate, correct answer) / max(estimate, correct answer)). Missing answers score zero. There is no speed bonus.

## Run locally

Install Node.js 22.12 or later (Node 22 or 24 recommended), then open this folder in a terminal:

```sh
npm ci
npm run build
npm start
```

Open http://localhost:3000. For two players on this computer, use two tabs or browsers with different nicknames. For another device on the same Wi-Fi, use the computer's LAN address with port 3000 and allow incoming access to the game server if the OS asks.

For development, run `npm start` in one terminal and `npm run dev` in a second. Vite forwards multiplayer requests to port 3000.

## Tests

```sh
npm test
```

The automated suite opens independent Socket.IO network connections. It verifies a three-round match, scores, secret answers, synchronized results, rematch, host permissions, deadlines, invalid and duplicate submissions, late joining, separate-room isolation, eight-player capacity, and host departure. Short timers are injected only into the test server; normal games always use 30 seconds.

## Deploy to Render (free)

This is a **Web Service**, not a static site: the Node server must remain running for multiplayer.

1. Upload this project's source to a new GitHub repository. Include the lockfile; exclude `node_modules`, `.env`, and generated `dist`.
2. In Render, choose **New → Web Service** and select the repository.
3. Choose **Node**, the **Free** instance, and these settings:
   - Build command: `npm ci --include=dev && npm run build`
   - Start command: `npm start`
   - Health check path: `/health`
   - Node version: `22.16.0` (or a supported newer Node 22/24 version)
4. Deploy and open the returned HTTPS URL.
5. Create a room in one browser and join it from a second device. Complete all three rounds and compare the final totals.

A `render.yaml` blueprint and Dockerfile are included. Run one server instance; this MVP stores rooms in that process.

Free Render services may sleep after 15 minutes without inbound traffic and take about a minute to wake. Open the game ahead of a demo. Server restarts or deployments erase active rooms. Do not redeploy during a match.

## MVP behavior and limits

- Refreshing or losing the connection leaves the room; no reconnect-token recovery.
- If the host leaves, the room closes with an explanation. There is no host migration.
- A disconnected non-host stays on the current match's scoreboard and is removed when the host returns to the lobby.
- New players join only in the lobby. Expired room codes cannot be reused to recover matches.
- Rooms expire after two hours. The server caps room count and incoming message size and rate-limits player actions.
- Correct answers stay on the server until reveal. Browsers never submit scores or control the match clock.
- The small, public question bank is intended for friendly competition; repeat players can learn answers.
- Fonts load from Google Fonts with local font fallbacks. Game logic works without the font request.

## Question verification

Twelve questions cover four categories. Three different categories are selected per match. Answers are either published facts or calculations from explicitly stated assumptions. Each reveal includes a source link.

- NIST, [SI defining constants](https://www.nist.gov/si-redefinition/meet-constants): speed of light. Light-travel distance/time and vacuum wavelength/frequency questions are calculated using c = 299,792,458 m/s.
- OpenStax, [Propagation of Light](https://openstax.org/books/university-physics-volume-3/pages/1-1-the-propagation-of-light): refractive index n = c/v, used for the idealized fiber question.
- NASA, [Moon facts](https://science.nasa.gov/moon/facts/): mean distance 384,400 km and rounded radius 1,740 km.
- NASA, [Sun facts](https://science.nasa.gov/sun/facts/): approximate photosphere temperature 5,500 °C.
- NIST, [byte](https://csrc.nist.gov/glossary/term/Byte) and [bit](https://csrc.nist.gov/glossary/term/bit): data-size and binary-value calculations. Pixel metadata and dataset overhead are expressly excluded.

## Structure

- `src/`: responsive browser interface.
- `server/game.js`: authoritative room state, round transitions, validation and scoring.
- `server/questions.js`: server-only question bank and source references.
- `server/index.js`: web server, Socket.IO, static assets, health endpoint.
- `tests/game.test.js`: network integration and scoring tests.
