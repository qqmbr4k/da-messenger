# DAMessenger

A full-stack real-time web chat application with Jabber/XMPP federation support.

## Quick start

```bash
docker compose up
```

- Web UI: http://localhost:3000
- Backend API: http://localhost:4000
- XMPP (Jabber): localhost:5222

## Features

### Core chat
- Registration, login, persistent sessions (JWT in httpOnly cookies)
- Password change, password reset, account deletion
- Public and private chat rooms — catalog, search, join/leave
- Private room invitations
- One-to-one direct messages (friends only)
- Message replies, editing, deletion
- File and image attachments (upload button + paste)
- Infinite scroll through full message history (seq-based cursor pagination)
- Unread badges, desktop-style toast notifications, typing indicators

### Presence
- Online / AFK / offline status with <2s propagation
- Multi-tab aware — online if any tab active, AFK only when all tabs idle >1 min
- Activity detection via cursor/keyboard throttle (1.5s window)
- Tab hibernation recovery via Page Visibility API + gap detection on reconnect

### Moderation
- Room owner and admin roles
- Admins: delete messages, remove/ban members, manage bans, invite users
- Owner: all admin actions + remove admins + delete room
- User-to-user ban (blocks messaging, terminates friendship)

### Message integrity
- Per-room sequential watermarks (`RoomSeq` table, atomic PostgreSQL upsert)
- Client tracks `localMaxSeq`; detects gaps in incoming WebSocket seq
- Missed messages back-filled via `GET /messages?afterSeq=N`
- Server emits `room_seq` on join so reconnecting clients can detect drift

### Jabber / XMPP
- ejabberd server bundled in Docker Compose (port 5222)
- Connect any Jabber client using your DAMessenger username + password
- XEP-0114 external component bridge syncs messages between XMPP and web UI
- S2S federation — two-server setup available via `--profile federation`
- XMPP admin dashboard at `/xmpp` (bridge status, connected clients, S2S stats)

## Architecture

```
Browser ──WebSocket──▶ Node.js/Express + Socket.io ──▶ PostgreSQL
                              │
                         XEP-0114 component
                              │
                          ejabberd ◀──── Jabber clients
                              │
                        S2S federation
                              │
                          ejabberd-b (--profile federation)
```

| Service    | Port | Credentials | Description |
|------------|------|-------------|-------------|
| frontend   | 3000 | register any account | Vite/React SPA |
| backend    | 4000 | — | Express REST + Socket.io |
| postgres   | 5432 | `chat` / `chat` | PostgreSQL 16 |
| pgadmin    | 5050 | `admin@admin.com` / `admin` | Database GUI |
| minio      | 9001 | `minioadmin` / `minioadmin` | Object storage console |
| ejabberd   | 5222 | — | XMPP c2s (Jabber clients) |
| ejabberd   | 5269 | — | XMPP s2s (federation) |
| ejabberd   | 5275 | — | XEP-0114 component (bridge) |
| ejabberd   | 5280 | — | ejabberd HTTP admin API |

## pgAdmin — connect to the database

1. Open http://localhost:5050 and log in with `admin@admin.com` / `admin`
2. Click **Add New Server**
3. Fill in:
   - **Name:** `da-messenger`
   - **Host:** `postgres`
   - **Port:** `5432`
   - **Database:** `chat`
   - **Username:** `chat`
   - **Password:** `chat`

## Federation (two XMPP servers)

```bash
docker compose --profile federation up -d
```

Starts a second ejabberd instance (`xmpp-b.localhost`, ports 5223/5270/5281).  
Static IPs are pre-configured so S2S TLS handshake resolves without external DNS.

**Connect Jabber clients:**
- Server A: `xmpp.localhost` → `localhost:5222`
- Server B: `xmpp-b.localhost` → `localhost:5223`

Add a cross-server contact (`user@xmpp-b.localhost`) to trigger the S2S link.

## Running tests

Requires the stack to be running (`docker compose up`).

```bash
cd backend
npm test                          # all 92 tests
npx vitest run tests/xmpp.test.ts # XMPP + account deletion (22 tests)

# Federation load test (requires --profile federation)
docker compose --profile federation up -d ejabberd-b
npx vitest run tests/federation.test.ts
```

**Test coverage:**

| Suite | Tests | What |
|-------|-------|------|
| auth | 11 | register, login, sessions, password, account delete |
| rooms | 12 | CRUD, join/leave, bans, invitations, catalog |
| messages | 10 | send, history, pagination, replies, edit, delete, access |
| watermarks | 8 | seq ordering, afterSeq/beforeSeq, 150-msg pagination |
| uploads | 7 | attach, access control, room deletion cleanup |
| friends | 8 | requests, accept, decline, remove, ban |
| directs | 5 | open DM, dedup, send, access control |
| xmpp | 22 | auth delegation, stats API, user sync, account deletion |
| federation | 9 | 50×2 clients, A→B, B→A, A↔B, single-server ring |
| **total** | **92** | |

## Tech stack

**Backend:** Node.js, TypeScript, Express, Socket.io, Prisma ORM, PostgreSQL, argon2, JWT  
**Frontend:** React, TypeScript, Vite, TailwindCSS, Zustand, @tanstack/react-query  
**XMPP:** ejabberd, XEP-0114 component protocol (raw TCP, fast-xml-parser)  
**Infrastructure:** Docker Compose, PostgreSQL 16, multi-arch ejabberd image

## Environment variables

All defaults work out of the box. For production, override in `docker-compose.yml`:

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | `supersecretjwtkey_change_in_prod` | Sign auth tokens |
| `DATABASE_URL` | postgres://chat:chat@postgres/chat | PostgreSQL DSN |
| `XMPP_COMPONENT_SECRET` | `bridgesecret` | ejabberd component password |
| `FRONTEND_URL` | `http://localhost:3000` | CORS origin |
