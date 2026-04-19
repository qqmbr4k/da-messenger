# Architecture

## Overview

DAMessenger is a single-tenant, self-hosted chat application. All services run in Docker Compose. There is no cloud dependency — the entire stack runs on one machine.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Docker Compose                                │
│                                                                         │
│  ┌─────────────┐   HTTP/WS    ┌──────────────────────────────────────┐  │
│  │             │─────────────▶│  nginx :3000                         │  │
│  │   Browser   │              │  • serves React SPA (static)         │  │
│  │             │◀─────────────│  • proxy /api/*  → backend:4000      │  │
│  │  React 18   │              │  • proxy /socket.io/* → backend:4000 │  │
│  │  Zustand    │              └──────────────┬───────────────────────┘  │
│  │  React Query│                             │                          │
│  │  Socket.io  │              ┌──────────────▼───────────────────────┐  │
│  │  WebRTC     │              │  Node.js backend :4000               │  │
│  │             │              │  Express + Socket.io                 │  │
│  └─────────────┘              │  Prisma ORM                          │  │
│                               └───┬──────────┬───────────┬───────────┘  │
│  ┌─────────────┐                  │          │           │              │
│  │  XMPP client│                  ▼          ▼           ▼             │
│  │  (Gajim,    │  ┌──────────────────┐ ┌─────────┐ ┌──────────┐       │
│  │   Pidgin…)  │  │  PostgreSQL :5432│ │  MinIO  │ │ ejabberd │       │
│  └──────┬──────┘  │  (Prisma schema) │ │  :9000  │ │  :5222   │       │
│         │ :5222   └──────────────────┘ └─────────┘ └────┬─────┘       │
│         └─────────────────────────────────────────────▶──┘             │
│                                               XEP-0114 :5275           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Services

| Service | Internal host | Exposed port | Purpose |
|---|---|---|---|
| `frontend` | `frontend` | **3000** | nginx — static SPA + reverse proxy |
| `backend` | `backend` | **4000** | Express REST API + Socket.io |
| `postgres` | `postgres` | **5432** | PostgreSQL 16 |
| `minio` | `minio` | **9000** (API), **9001** (console) | S3-compatible object store |
| `ejabberd` | `ejabberd` | **5222** (c2s), **5269** (s2s), **5275** (component), **5280** (HTTP API) | XMPP server |
| `pgadmin` | `pgadmin` | **5050** | PostgreSQL GUI |
| `minio-init` | — | — | One-shot: creates the `uploads` bucket |
| `db-seed` | — | — | One-shot: seeds 12 M+ rows on first boot |

### How to connect

**PostgreSQL** (psql / pgAdmin / any client):
```
Host: localhost  Port: 5432  DB: chat  User: chat  Password: chat
```

**MinIO** (S3 SDK, mc CLI, or browser console at `:9001`):
```
Endpoint: http://localhost:9000  Access key: minioadmin  Secret: minioadmin  Bucket: uploads
```

**ejabberd XMPP** (any Jabber client — Gajim, Pidgin, Conversations):
```
Server: xmpp.localhost  Port: 5222  TLS: optional (disable cert validation in dev)
Username/Password: your DAMessenger account credentials
```

**ejabberd HTTP admin API** (internal only, not exposed by default):
```
http://ejabberd:5280/api/   — used by the bridge to query registered user count
```

---

## HTTP Request path

Every browser request hits nginx on port 3000:

```
Browser → nginx:3000
  /api/*        → proxy → backend:4000/api/*   (REST)
  /socket.io/*  → proxy → backend:4000         (WebSocket upgrade)
  /*            → serve /usr/share/nginx/html   (React SPA, SPA fallback to index.html)
```

The React app always uses relative paths (`/api/...`), so it works regardless of the machine's hostname.

---

## Authentication & sessions

**Design choice: JWT stored in httpOnly cookie, session row in DB.**

Why not pure stateless JWT? Because we need revocable sessions (users can log out specific devices). A pure JWT can't be invalidated before expiry.

Why not session-only (no JWT)? JWTs let the Socket.io auth middleware verify identity without an extra DB query per connection — it reads `sessionId` from the token, then does a single `Session` lookup.

```
POST /api/auth/login
  → argon2.verify(password, stored hash)
  → create Session row (id, userId, token, userAgent, ip, expiresAt)
  → sign JWT: { userId, sessionId }  HS256 with JWT_SECRET
  → Set-Cookie: token=<jwt>; HttpOnly; SameSite=Strict; Max-Age=30d

Every subsequent request:
  → read JWT from cookie (or Authorization: Bearer header)
  → verify signature
  → prisma.session.findUnique({ id: payload.sessionId })
  → check expiresAt > now
  → attach userId / sessionId to req
```

Socket.io auth uses the same flow — token extracted from `handshake.auth.token` or the `Cookie` header.

Password hashing: **argon2id**, m=65536, t=3, p=4 (OWASP recommended parameters as of 2024).

---

## Database schema

```
User ──────────────────────────────────────────────────────────────────┐
 │ id (uuid PK)                                                         │
 │ email (unique)                                                       │
 │ username (unique, immutable)                                         │
 │ password (argon2id hash)                                             │
 │                                                                      │
 ├──< Session (userId FK, cascade delete)                               │
 │    id, token (unique), userAgent, ipAddress, expiresAt               │
 │                                                                      │
 ├──< RoomMember (userId + roomId composite PK)                         │
 │    joinedAt                                                           │
 │                                                                      │
 ├──< RoomAdmin (userId + roomId composite PK)                          │
 │                                                                      │
 ├──< RoomBan (userId + roomId unique)                                  │
 │    bannedById → User                                                 │
 │                                                                      │
 ├──< RoomInvitation (roomId + userId unique)                           │
 │    invitedById → User                                                │
 │                                                                      │
 ├──< Message (authorId FK)                                             │
 │    id, roomId, seq (BigInt), content (varchar 3072)                  │
 │    replyToId → Message (self-ref)                                    │
 │    forwardedFromId → Message (self-ref)                              │
 │    editedAt, deletedAt (soft delete)                                 │
 │    search_vector (tsvector, GENERATED ALWAYS AS STORED)             │
 │     └──< Attachment                                                  │
 │           filename (uuid-based, stored on disk)                      │
 │           originalName, mimeType, size, comment                      │
 │     └──< Reaction (messageId + userId + emoji unique)               │
 │                                                                      │
 ├──< FriendRequest (requesterId + recipientId unique)                  │
 │    status: PENDING | ACCEPTED | DECLINED                             │
 │                                                                      │
 ├──< Friendship (userAId + userBId unique)                             │
 │    stored once; queries use OR (userAId=X OR userBId=X)              │
 │                                                                      │
 ├──< UserBan (issuerId + bannedId unique)                              │
 │                                                                      │
 └──< UserRoomWatermark (userId + roomId composite PK)                  │
      lastSeq (BigInt) — highest seq the user has acknowledged          │
                                                                        │
Room ──────────────────────────────────────────────────────────────────┘
 │ id (uuid PK)
 │ name (unique)
 │ type: PUBLIC | PRIVATE | DIRECT
 │ ownerId → User (nullable — SET NULL on user delete)
 │
 └──< RoomSeq
      roomId (PK), seq (BigInt)
      — single row per room, atomically incremented on every message send
```

**Key design decisions:**

- **Soft deletes on Message** (`deletedAt`): content is cleared but the row stays so `seq` gaps don't break pagination. Reply references still render as "deleted message".
- **RoomSeq as atomic counter**: uses PostgreSQL `INSERT … ON CONFLICT DO UPDATE SET seq = seq + 1 RETURNING seq`. Guarantees no two messages share a seq within a room without application-level locking.
- **DIRECT rooms are regular Room rows** with `type=DIRECT` and exactly two `RoomMember` rows. This gives DMs the full Room feature set (history, reactions, files, replies) for free.
- **Owner is nullable** (`SET NULL` on delete): room survives user deletion. Admins remain; new owner must be assigned manually (or the room becomes owner-less).

---

## Message sequencing & gap detection

**Problem:** WebSocket delivery is not guaranteed. A client that reconnects after a network drop may miss messages. We can't rely on "latest N messages" for correctness.

**Solution: per-room monotonic sequence numbers.**

```
Send message:
  1. INSERT Message with seq = nextRoomSeq(roomId)      ← atomic upsert
  2. socket.to(`room:${roomId}`).emit('new_message', { ...msg, seq })

Client receives message:
  if msg.seq > localMaxSeq + 1:
    → gap detected → GET /messages?afterSeq=localMaxSeq  (fetch missed range)
  else:
    → localMaxSeq = max(localMaxSeq, msg.seq)

Client reconnects:
  → server emits `room_seq: { roomId, seq }` (current head)
  → client compares with localMaxSeq → fetches gap if needed
```

**Pagination API:**
```
GET /api/rooms/:id/messages
  ?limit=30                   → latest 30 (initial load, newest first then reversed)
  ?beforeSeq=N&limit=30       → 30 messages older than seq N  (scroll up / load older)
  ?afterSeq=N&limit=100       → messages newer than seq N     (gap fill on reconnect)
```

**Unread tracking (UserRoomWatermark):**
- One row per (user, room) — never grows with message volume.
- Client posts `POST /api/rooms/:id/watermark` with `seq` whenever it reads.
- On join, server sends `room_seq` so client knows if there are unread messages above its watermark.
- Sidebar unread badge = rooms where `room.seq > watermark.lastSeq`.

---

## Real-time events (Socket.io)

All socket connections are authenticated via the same JWT/session mechanism as HTTP.

On connect, the server:
1. Resolves `userId` from token
2. Joins the socket to `room:<roomId>` for every room the user is a member of
3. Joins `user:<userId>` (for direct call signaling)
4. Broadcasts `presence: { userId, status: 'online' }` to all those rooms

### Event catalog

| Event | Direction | Payload | Description |
|---|---|---|---|
| `new_message` | server→client | `Message` | New message in a room |
| `message_edited` | server→client | `{ id, content, editedAt }` | Message content updated |
| `message_deleted` | server→client | `{ id, roomId }` | Message soft-deleted |
| `reaction_update` | server→client | `{ messageId, reactions[] }` | Reaction added/removed |
| `room_seq` | server→client | `{ roomId, seq }` | Current head seq (on join / reconnect) |
| `presence` | server→client | `{ userId, status }` | User came online / went AFK / went offline |
| `heartbeat` | client→server | — | User activity ping (resets AFK timer) |
| `typing_start` / `typing_stop` | client→server | `{ roomId }` | Typing indicator |
| `typing` | server→client | `{ roomId, username, typing }` | Broadcast typing state |
| `member_joined` / `member_left` | server→client | `{ roomId, userId, username }` | Room membership changes |
| `member_kicked` / `member_banned` | server→client | `{ roomId, userId }` | Admin actions |
| `member_role_changed` | server→client | `{ roomId, userId, role }` | Admin promotion/demotion |
| `room_updated` | server→client | `Room` | Room settings changed |
| `call_offer` | client→server | `{ to, signal, isVideo }` | Initiate WebRTC call |
| `call_answer` | client→server | `{ to, signal }` | Accept call |
| `call_ice` | client→server | `{ to, candidate }` | ICE candidate exchange |
| `call_end` / `call_reject` / `call_busy` | bidirectional | `{ to/from }` | Call lifecycle |

---

## Presence system

**Design:** server-side multi-tab state machine, no persistent storage.

```
userTabs: Map<userId, Map<socketId, TabState>>
  TabState { socketId, userId, lastActivity: timestamp, status }

computeUserStatus(tabs):
  if tabs.empty → 'offline'
  if any tab has lastActivity within 60s → 'online'
  else → 'afk'
```

- Each browser tab opens one Socket.io connection → one `TabState` entry.
- Client sends `heartbeat` on user interaction (mousemove/keydown, throttled to 1.5 s).
- Server runs a 15-second `setInterval` per connected socket. Computes `computeUserStatus(tabs)` and broadcasts only if status changed from last broadcast.
- On disconnect, the tab's `TabState` is removed. If no tabs remain → `offline` broadcast.
- **Multi-tab rule:** AFK only when **all** tabs are idle for 60 s. Online if **any** tab sent a heartbeat recently.

Presence broadcast goes to `room:<roomId>` for every room the user belongs to — a single `prisma.roomMember.findMany` per status change.

---

## Full-text search

**Implementation:** PostgreSQL native FTS with `tsvector` generated column.

```sql
-- Migration adds this to Message:
ALTER TABLE "Message"
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX idx_message_fts      ON "Message" USING GIN (search_vector);
CREATE INDEX idx_message_fts_live ON "Message" USING GIN (search_vector) WHERE "deletedAt" IS NULL;
```

**Why generated/stored?** No application-level sync needed. PostgreSQL maintains the column automatically on every INSERT/UPDATE. The GIN index is built on top of it.

**Query flow:**
1. Parse filter tokens from the query string: `in:#room`, `in:@user`, `from:@user`
2. Resolve filter tokens to room/user IDs; intersect with the user's accessible rooms
3. Run FTS query: `search_vector @@ websearch_to_tsquery('english', $text)`
4. `ts_headline(...)` produces a snippet with matched terms wrapped in `<b>...</b>`
5. Frontend `SnippetText` component parses only `<b>` tags — no `dangerouslySetInnerHTML`

**Attachment search** uses `to_tsvector('simple', originalName)` with a prefix match (`term:*`) — `simple` config because filenames aren't natural language.

**Access control:** the query always filters `WHERE roomId = ANY($accessibleRoomIds)` — users can only search rooms they're members of, enforced in SQL.

---

## File storage

Files are stored in **MinIO** (S3-compatible). The backend generates a UUID filename and streams the upload to MinIO via the AWS SDK. The original filename is preserved in the `Attachment` table.

```
Upload:
  POST /api/rooms/:roomId/files
    ← multipart/form-data (multer → memory buffer → S3 PutObject)
    → Attachment row created
    → new_message socket event includes attachment metadata

Download:
  GET /api/rooms/:roomId/files/:attachmentId
    → verify user is current room member
    → generate presigned S3 GetObject URL (15 min expiry)
    → redirect 302 to presigned URL
```

**Access control:** membership is checked on every download. If a user is kicked from a room, their previously-uploaded files immediately become inaccessible — the presigned URL is never generated for non-members. Files themselves are not deleted unless the room is deleted.

**MIME allowlist** is enforced on upload to block dangerous types (SVG, HTML, JS, etc.).

---

## WebRTC voice & video calls

Calls are 1-on-1 and only available inside Direct Message rooms (requires friendship).

### Signaling via Socket.io

```
Caller                    Server (relay)              Callee
  │                            │                         │
  │── call_offer ─────────────▶│── call_offer ──────────▶│
  │   { to, signal, isVideo }  │   { from, signal }      │ (shown in UI)
  │                            │                         │
  │                            │◀─── call_answer ────────│
  │◀── call_answer ────────────│     { to, signal }      │
  │    { from, signal }        │                         │
  │                            │                         │
  │── call_ice ───────────────▶│── call_ice ────────────▶│  (ICE candidates,
  │◀── call_ice ───────────────│◀─── call_ice ───────────│   both directions)
  │                            │                         │
  ╔═══════ WebRTC P2P (DTLS-SRTP, bypasses server) ══════╗
  ║            direct UDP/TCP media stream                ║
  ╚═══════════════════════════════════════════════════════╝
```

The server **only relays signaling** — it never touches the media stream. `call_ice`, `call_offer`, `call_answer` are forwarded to `user:<targetId>` socket room. The server verifies a shared DM exists before relaying (guards against arbitrary call spam).

### ICE / NAT traversal

```typescript
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // TURN relay — required for symmetric NAT (corporate/mobile networks)
  { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', ... },
]
```

STUN resolves public IPs for full-cone NATs. TURN is a fallback relay for symmetric NAT (common in home routers and mobile data). Without TURN, calls simply fail to connect between many real-world networks.

### Key implementation decisions

**`new MediaStream() + addTrack` vs `e.streams[0]`:**
`e.streams[0]` can be `undefined` in Firefox and some mobile browsers when no stream is bundled with the track. Using a persistent `remoteStreamRef = useRef(new MediaStream())` and calling `addTrack(e.track)` is reliable across all browsers.

**`hangUpRef` pattern:**
PC event handlers (`ontrack`, `onconnectionstatechange`) are closures created once. If they capture `hangUp` directly, they get a stale version when `remoteUserId` changes. Keeping `hangUpRef.current = hangUp` in a `useEffect` ensures handlers always call the latest version.

**`onnegotiationneeded = () => {}`:**
`addTrack` triggers `onnegotiationneeded` in modern browsers. Since we create the offer manually immediately after adding tracks, we suppress automatic renegotiation to avoid a double-offer race.

**ICE disconnection recovery:**
`'disconnected'` is a transient ICE state (network blip). We wait 4 seconds before tearing down — the browser may self-recover. `'failed'` is permanent → immediate hangup.

---

## XMPP / Jabber bridge

### Architecture

```
Jabber client (Gajim)
    │ XMPP (port 5222)
    ▼
ejabberd
    │ XEP-0114 component protocol (TCP, port 5275)
    ▼
Node.js XmppBridge (src/xmpp/bridge.ts)
    │ raw net.Socket + XML streaming
    │ fast-xml-parser for parsing
    ▼
Prisma → PostgreSQL (store/retrieve messages)
    │
    ▼
Socket.io → browser clients (real-time delivery)
```

### XEP-0114 handshake

```
Bridge → ejabberd: <stream:stream to='chat.xmpp.localhost'>
ejabberd → Bridge: <stream:stream id='STREAM_ID'>
Bridge → ejabberd: <handshake>SHA1(STREAM_ID + COMPONENT_SECRET)</handshake>
ejabberd → Bridge: <handshake/>   ← success
```

After handshake, the bridge owns the `chat.xmpp.localhost` subdomain. JIDs look like `roomname@chat.xmpp.localhost`.

### Message flow (XMPP → Web)

```
Jabber user sends to: general@chat.xmpp.localhost
  → ejabberd routes to bridge (XEP-0114)
  → bridge parses <message> stanza, extracts from/to/body
  → resolve "general" to Room by name in DB
  → verify sender is a member of that room (by XMPP username matching DAMessenger username)
  → prisma.message.create(...)
  → socket.to(`room:${roomId}`).emit('new_message', ...)
```

### Message flow (Web → XMPP)

When a web user sends a message to a room that has connected XMPP clients:
```
  → bridge.sendToRoom(roomId, authorUsername, content)
  → look up XMPP-connected members
  → send <message> stanzas to each connected JID
```

### Federation (S2S)

```bash
docker compose --profile federation up -d
```

Starts a second ejabberd (`ejabberd-b`) on a separate Docker network IP. Static IPs (`172.28.0.10`, `172.28.0.11`) are pre-configured with `extra_hosts` so S2S TLS DNS resolves without external DNS.

- Server A domain: `xmpp.localhost` (XMPP port 5222, s2s 5269)
- Server B domain: `xmpp-b.localhost` (XMPP port 5223, s2s 5270)

Cross-server contact `user@xmpp-b.localhost` triggers the S2S session. Federation traffic appears in the XMPP Bridge admin page (`/api/xmpp/stats`).

---

## Lazy message loading

**Problem:** Rooms have millions of messages. Loading all of them on join would be slow and wasteful.

**Solution:** cursor-based pagination by `seq`.

```
Initial load:  GET /messages?limit=30           → latest 30 messages
Scroll up:     GET /messages?beforeSeq=N&limit=30 → 30 older messages
Search jump:   GET /messages?beforeSeq=targetSeq+1&limit=30  → messages around result
```

**Client state machine:**
```
hasMore = true initially
  → set to false when a fetch returns < 30 results (reached beginning of history)

showJumpToPresent = true when initialSeq prop is provided (search navigation)
  → "↓ Jump to present" button reloads latest 30 + scrolls to bottom
  → resets hasMore = true (room has live messages again)
```

**Scroll anchor preservation:** when loading older messages, the client records `scrollHeight` before inserting new rows, then sets `scrollTop = newScrollHeight - prevScrollHeight` to keep the viewport stable.

---

## Frontend state management

| Store | Library | What |
|---|---|---|
| `useAuthStore` | Zustand | Logged-in user (id, username). Persisted to localStorage. |
| `useCallStore` | Zustand | Active call state (status, remoteUser, signal). Ephemeral. |
| `useUnreadStore` | Zustand | Per-room unread counts and watermark seqs. |
| Server data | React Query | Rooms, messages, members, files. Cached + invalidated on socket events. |

React Query handles all API calls. Socket.io events call `queryClient.setQueryData` or `setMessages` directly to mutate local state without a round-trip.

**Why Zustand for auth/call instead of React Query?**
- Auth state is read synchronously on every render (in Socket.io middleware, route guards, etc.) — React Query's async model is too slow.
- Call state is a UI state machine (`idle → calling → connecting → connected`), not server data.

---

## Key indexes

| Index | Type | Purpose |
|---|---|---|
| `Message.search_vector` | GIN | Full-text search |
| `Message (roomId, seq DESC) WHERE deletedAt IS NULL` | B-tree partial | Timeline queries — `beforeSeq` / `afterSeq` pagination |
| `Message (authorId)` | B-tree | `from:@user` search filter |
| `Message (createdAt DESC)` | B-tree | Date-range queries |
| `Attachment.originalName` (tsvector) | GIN | Filename search |
| `RoomMember (userId)` | B-tree | "what rooms is this user in?" — membership checks, sidebar, presence |
| `RoomMember (roomId)` | B-tree | "who is in this room?" — member panel, presence broadcast |
| `UserRoomWatermark (userId)` | B-tree | Load all watermarks for a user on login |
| `Session (userId)` | B-tree | List / invalidate sessions |
| `Reaction (messageId)` | B-tree | Load reactions per message |

---

## Startup dependencies

```yaml
postgres: healthcheck (pg_isready)
minio:    healthcheck (mc ready)
  minio-init: depends_on minio (healthy) → creates bucket → exit 0
backend:
  depends_on postgres (healthy), minio (healthy)
  entrypoint: prisma migrate deploy → node dist/index.js
  healthcheck: GET /healthz → "ok"
db-seed:
  depends_on backend (healthy)
  runs: seed-entrypoint.sh (idempotent: skips if seed_user_1 exists)
  restart: "no"
frontend:
  depends_on backend (healthy)
  serves pre-built static files via nginx
```

**Why db-seed depends on backend (not postgres)?**
Prisma migrations run inside the backend entrypoint. The seed SQL references tables that only exist after migrations complete. Depending on `backend: healthy` guarantees migrations have finished.

---

## Security notes

- Passwords: argon2id (memory-hard, OWASP recommended)
- Sessions: DB-backed, revocable, 30-day expiry
- Auth token: httpOnly cookie + `SameSite=Strict` (CSRF-resistant)
- File downloads: presigned S3 URLs (15 min), membership re-checked on every request
- MIME allowlist: blocks SVG, HTML, JS uploads (stored XSS prevention)
- FTS queries: parameterized via `websearch_to_tsquery` (no injection surface)
- Search access: `WHERE roomId = ANY($userRoomIds)` — enforced in SQL, not application layer
- Call signaling: DM existence verified before relaying any call signal
- `X-Content-Type-Options: nosniff` on all responses
