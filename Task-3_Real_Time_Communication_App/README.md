# CodeAlpha Real-Time Communication App

An independent full-stack submission for CodeAlpha Full Stack Development, Task 4. Open a private room for conversation, shared sketches, file exchange, and optional peer-to-peer calls.

## Features

- Account registration and sign-in.
- Rooms with invite links and room codes, member controls, leave, kick, and delete actions.
- Client-side AES-GCM encryption for room message, file, and whiteboard event payloads.
- Shared whiteboard with colors, pen sizing, shape tools, text, eraser, undo, and clear.
- WebRTC camera, microphone, and screen sharing controls.
- Responsive dark indigo interface with a light theme option.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

Open `http://localhost:3000`, sign in, and create a room. Share the invite link with another signed-in account to open encrypted room history. Camera and microphone remain off until enabled. Calls use browser WebRTC and a public STUN server; restrictive networks may require a TURN relay.

## Stack

HTML, CSS, JavaScript, Express, SQLite (`better-sqlite3`), server-sent events, WebRTC, and the Web Crypto API.

## Design reference

The visual direction takes cues from [NeuroBank — Online Banking Dashboard Design](https://dribbble.com/shots/26127078-NeuroBank-Online-Banking-Dashboard-Design): deep indigo surfaces, crisp blue signals, compact information hierarchy, and a focused dark canvas. These colors and dashboard cues are adapted to communication controls, not financial content.
