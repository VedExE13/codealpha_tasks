# Product

Open Room is a private communication and collaboration space for a small group. People should be able to exchange messages and files, sketch together, and optionally talk face to face without media starting unexpectedly.

## Audience and job

Small teams who need conversation and shared working material in one room, with explicit control over camera, microphone, and screen sharing.

## Product facts

- Rooms and membership are stored in SQLite and require a signed-in account.
- Invite links carry the private room key in the URL fragment; room codes identify a room but do not decrypt its history.
- Message, file, and whiteboard payloads are encrypted client-side with AES-GCM before storage.
- Room event updates are delivered over server-sent events.
- Calls use peer-to-peer WebRTC. Screen sharing and camera/microphone require browser permission.
- Local databases and private invite keys are not committed to the repository.

## Preserve

Media starts off. Make call state, encryption behavior, invite-key needs, and room-management actions legible. Do not describe room codes as encryption keys or promise a TURN relay that is not configured.
