# DAMessenger

A full-featured real-time chat app — Slack-style UI, WebRTC calls, full-text search, XMPP/Jabber bridge, and a massive pre-loaded dataset for realistic testing.

---

## 🚀 JUST RUN THIS. EVERYTHING IS AUTOMATIC.

```bash
git clone <repo-url>
cd da-messenger
docker compose up
```

**Open → [http://localhost:3000](http://localhost:3000)**

No `.env` files. No manual migrations. No extra commands. It works.

---

## 🌱 AUTOMATIC DATA SEEDING — HAPPENS ON FIRST BOOT

**THE DATABASE IS AUTOMATICALLY POPULATED WITH 3 YEARS OF REALISTIC CHAT HISTORY ON THE VERY FIRST `docker compose up`.**

This is handled by the `db-seed` Docker service that runs once (skipped on subsequent restarts).

### What gets inserted automatically:

| Data | Volume |
|---|---|
| 👤 **Users** | **300** (`seed_user_1` … `seed_user_300`) |
| 💬 **Rooms** | **1 000** public rooms across 20 topic categories |
| 📨 **Messages** | **~12 600 000** — 3 years of history, 10–20 messages/day per room |
| 📎 **Attachments** | **~500 000** fake file records (~4% of messages) |

### Login with any seed account:

```
Email:    seed_1@seed.test   (or seed_2@seed.test … seed_300@seed.test)
Password: password123
```

> **⏱ Seeding takes ~5–10 minutes on first boot.** The app is fully usable while seeding runs — rooms and messages appear progressively. On every subsequent `docker compose up`, seeding is **skipped automatically** (checks if `seed_user_1` already exists).

> **💾 To start completely fresh:** `docker compose down -v && docker compose up`

---

## Startup sequence

```
postgres      → healthy
├── minio     → healthy
│   └── minio-init  → creates S3 bucket → exits
├── backend   → prisma migrate deploy → server starts → healthy
│   ├── db-seed   → seeds 12M+ rows on first run → exits
│   └── frontend  → nginx serving React SPA
└── pgadmin   → DB admin UI
```

### Ports

| Service | URL | Credentials |
|---|---|---|
| **App** | http://localhost:3000 | register or use seed account |
| **API** | http://localhost:4000 | — |
| **pgAdmin** | http://localhost:5050 | `admin@admin.com` / `admin` |
| **MinIO console** | http://localhost:9001 | `minioadmin` / `minioadmin` |
| **XMPP (Jabber)** | localhost:5222 | your DAMessenger credentials |

---

## Screenshots

### Login

![Login](docs/screenshots/01-login.png)

### Main layout — sidebar with rooms

After login the sidebar lists all your joined rooms. Seed users are pre-joined to ~30 rooms.

![Main layout](docs/screenshots/03-main.png)

### Room chat — years of history, lazy-loaded

Each room has thousands of messages spanning 3 years. History loads in pages of 30 — click **"↑ Load older messages"** at the top or scroll up. After jumping to a search result, **"↓ Jump to present"** returns to the live feed.

![Room chat](docs/screenshots/06-room-chat.png)

### Browse 1 000 public rooms

![Browse rooms](docs/screenshots/05-browse-rooms.png)

### Global search — ⌘K / Ctrl+K

Full-text search across all messages and files in rooms you belong to. Supports filter syntax. Results jump directly to the message in history.

![Search](docs/screenshots/16-search-results-populated.png)

### Room management modal — members, admins, bans, invitations

Click **Settings** ⚙ in the top-right of any room you own or admin.

![Room settings](docs/screenshots/12-room-settings.png)

### Contacts & friends

![Contacts](docs/screenshots/09-contacts.png)

### Active sessions — remote logout

![Sessions](docs/screenshots/10-sessions.png)

### XMPP / Jabber bridge admin

![XMPP bridge](docs/screenshots/11-xmpp-bridge.png)

---

## Features

### Auth & accounts
- Register with email + username + password (argon2id hashing)
- Persistent login across browser restarts (JWT in httpOnly cookie)
- Forgot password / password reset flow
- Change password while logged in
- Delete account (cascades owned rooms, messages, files)

### Presence
- **Online / AFK / Offline** — updates in < 2 s via Socket.io
- AFK after 1 min of inactivity across all open tabs
- Multi-tab aware: online if **any** tab is active
- Presence shown in room member list and contacts sidebar

### Chat rooms
- Create public or private rooms
- **Public room catalog** with search — 1 000 rooms available in demo data
- Join/leave public rooms freely; invite-only for private rooms
- Roles: **Owner → Admins → Members**
- Admin actions: ban/unban, remove members, manage admins, delete messages
- Owner: all admin actions + delete room
- Room settings: rename, description, toggle public/private

### Messaging
- Real-time delivery via Socket.io (< 3 s)
- **Lazy history loading** — 30 messages at a time, button at top to load older
- **Jump to present** — one click returns from deep history to the live feed
- Reply to any message (quoted inline)
- Edit your own messages (`edited` indicator shown)
- Delete messages (author or room admin)
- Emoji reactions
- Forward messages to any accessible room
- Typing indicators
- Unread badge + **"New messages"** divider on first unread
- Date dividers between message groups
- Automatic scroll-to-bottom when at the live end; no forced scroll when reading history

### Attachments
- Upload via button or **paste directly from clipboard**
- Images displayed inline; other files as download cards
- Optional comment per attachment
- Access control enforced server-side — only current room members can download
- Files persist even if uploader leaves; files are deleted only when the room is deleted
- Max file: 20 MB · Max image: 3 MB · Stored in MinIO (S3-compatible)

### Direct messages
- Requires mutual friendship (send request → accept)
- Identical feature set to rooms (replies, edits, files, reactions, calls)
- User-to-user ban freezes the DM thread (history remains, read-only)

### Voice & video calls (WebRTC)
- 1-on-1 voice and video calls inside DMs
- Mute mic / toggle camera during a call
- Picture-in-picture local preview
- STUN + TURN relay fallback (works across NATs and firewalls via `openrelay.metered.ca`)
- Call timer, status display (ringing → connecting → connected)

### Full-text search
- **⌘K** (Mac) / **Ctrl+K** (Windows/Linux)
- Searches messages **and** file attachments across all accessible rooms/DMs
- Filter tokens:
  - `in:#room-name` — search within a specific room
  - `in:@username` — search in DM with someone
  - `from:@username` — messages by a specific author
- `↑↓` to navigate results, `↵` to jump to that message in history
- Powered by PostgreSQL `tsvector` GIN indexes + `ts_headline` snippets

### XMPP / Jabber bridge
- ejabberd server bundled, bridged via XEP-0114 component protocol
- Connect **any Jabber client** (Gajim, Pidgin, Conversations) with your DAMessenger credentials
- Admin dashboard: **XMPP Bridge** in sidebar — bridge status, connected client count, S2S federation stats
- S2S federation (two independent XMPP servers messaging each other) via `--profile federation`

### Sessions
- See all active sessions with browser user-agent and IP
- Remotely log out any specific session
- Sign-out only invalidates the **current** session

---

## How to test each feature

### Explore the seed data

1. Go to http://localhost:3000
2. Sign in: `seed_1@seed.test` / `password123`
3. Click any `seed-*` room in the sidebar → scroll up to browse 3 years of history
4. Press **⌘K** → type `deploy staging` or `bug in production` → press ↵ to jump to the message

### Real-time messaging (open two tabs)

Open two browser windows (or one normal + one incognito). Sign in as different seed users (`seed_1@seed.test`, `seed_2@seed.test`). Join the same room. Send messages — they appear instantly in both windows.

### Friend requests & DMs

1. Window A: `seed_1@seed.test` → **Contacts** → type `seed_user_2` → **Send Request**
2. Window B: `seed_2@seed.test` → **Contacts** → accept the request
3. Either window: click the user → **Send DM** → a private channel opens
4. Test the 📞 or 🎥 button in the DM header for a voice/video call

### File upload

In any room or DM:
- Click the **paperclip** icon to pick a file
- Or **paste an image** from clipboard directly into the message input (Ctrl+V / ⌘V)

### Room moderation

1. Register a fresh account → create a new room (+ button at bottom of sidebar)
2. Settings ⚙ → **Invitations** → invite a seed user by username
3. Settings ⚙ → **Members** → **Ban** them
4. Sign in as that seed user in another tab — the room is gone

### XMPP / Jabber client

Install [Gajim](https://gajim.org/) (desktop) or [Conversations](https://conversations.im/) (Android).

Add an account:
- **Server:** `xmpp.localhost`
- **Port:** `5222`
- **Username / Password:** any DAMessenger account
- Disable TLS certificate verification (dev environment)

Check the **XMPP Bridge** sidebar page — the connected client appears within a few seconds.

### Federation (two XMPP servers)

```bash
docker compose --profile federation up -d
```

- Server A: `xmpp.localhost` → `localhost:5222`
- Server B: `xmpp-b.localhost` → `localhost:5223`

Connect one Jabber client to each, add a cross-server contact (`user@xmpp-b.localhost`). The S2S session appears in the XMPP Bridge admin page.

---

## Architecture

> **Full deep-dive:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — DB schema, message sequencing, presence state machine, WebRTC call flow, XMPP bridge protocol, FTS implementation, all Socket.io events, startup dependency graph, security notes.

```
Browser (React + Socket.io)
        │
        ▼
   nginx :3000  ──proxy /api/──▶  Express :4000
                 ──proxy /socket.io/──▶ Socket.io
                                         │
                              ┌──────────┴──────────┐
                         PostgreSQL              MinIO S3
                          :5432                  :9000
                         (Prisma)             (file storage)
                              │
                        XEP-0114 bridge
                              │
                          ejabberd :5222
                              │  (S2S, optional)
                          ejabberd-b :5223
```

**Stack:**

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Zustand, React Query |
| Backend | Node.js, Express, Socket.io, Prisma ORM, argon2, JWT |
| Database | PostgreSQL 16 (FTS via `tsvector` GIN indexes, cursor-based pagination) |
| File storage | MinIO S3-compatible object store |
| Real-time | Socket.io (WebSocket + HTTP long-poll fallback) |
| Calls | WebRTC — STUN/TURN via Google STUN + openrelay.metered.ca |
| XMPP | ejabberd + Node.js XEP-0114 component bridge |

---

## Running tests

Requires the stack to be running (`docker compose up`).

```bash
cd backend
npm test                          # all 92 backend tests
npx vitest run tests/xmpp.test.ts # XMPP + account deletion (22 tests)

# Federation load test (requires --profile federation)
docker compose --profile federation up -d ejabberd-b
npx vitest run tests/federation.test.ts
```

| Suite | Tests |
|---|---|
| auth | 11 |
| rooms | 12 |
| messages | 10 |
| watermarks | 8 |
| uploads | 7 |
| friends | 8 |
| directs | 5 |
| xmpp | 22 |
| federation | 9 |
| **total** | **92** |

---

## Re-seeding

To wipe seed data and re-seed:

```bash
# Remove existing seed rows
docker compose exec postgres psql -U chat -d chat \
  -c "DELETE FROM \"Room\" WHERE name LIKE 'seed-%'"
docker compose exec postgres psql -U chat -d chat \
  -c "DELETE FROM \"User\" WHERE username LIKE 'seed\_user\_%' ESCAPE '\\'"

# Run the seed script (~5–10 min)
docker compose exec -T postgres psql -U chat -d chat \
  < backend/scripts/seed.sql
```

Complete reset (destroys **all** data including your own accounts):

```bash
docker compose down -v   # removes all Docker volumes
docker compose up        # fresh start — auto-seeds again
```

---

## Environment variables

All defaults work out of the box for local dev. Override in `docker-compose.yml` for production:

| Variable | Default | Notes |
|---|---|---|
| `JWT_SECRET` | `supersecretjwtkey_change_in_prod` | **Change this in production** |
| `DATABASE_URL` | `postgresql://chat:chat@postgres:5432/chat` | PostgreSQL DSN |
| `XMPP_COMPONENT_SECRET` | `bridgesecret` | ejabberd bridge password |
| `FRONTEND_URL` | `http://localhost:3000` | CORS allowed origin |
| `S3_ENDPOINT` | `http://minio:9000` | MinIO / S3 URL |

---

## pgAdmin — connect to the database

1. Open http://localhost:5050 → log in `admin@admin.com` / `admin`
2. **Add New Server** → fill in:
   - Host: `postgres` · Port: `5432`
   - Database: `chat` · Username: `chat` · Password: `chat`
