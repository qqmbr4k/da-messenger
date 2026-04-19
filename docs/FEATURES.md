# Features

> See also: [ARCHITECTURE.md](ARCHITECTURE.md) — technical deep-dive · [README.md](../README.md) — quick start

Complete feature reference for DAMessenger.

---

## Authentication & accounts

- Register with email + username + password
- Passwords hashed with argon2id (memory-hard, OWASP-recommended algorithm)
- Login with email + password
- Persistent login via JWT stored in httpOnly cookie — survives browser restarts
- Automatic re-authentication on page load (`/api/auth/me`)
- Forgot password flow — generates a time-limited reset token (1 hour TTL)
- Reset password with token
- Change password while logged in (requires current password confirmation)
- Delete account — cascades all owned rooms, messages, and uploaded files
- ejabberd account auto-provisioned on register / password synced on change / removed on delete

---

## Sessions

- View all active sessions: browser user-agent, IP address, created time
- See which session is current (highlighted)
- Remotely log out any individual session
- Logging out only invalidates the current session (other sessions stay active)
- Sessions expire after 30 days
- Password reset invalidates all existing sessions for security

---

## Presence

- Three states: **Online**, **AFK**, **Offline**
- Status updates propagate to all connected clients in < 2 seconds via Socket.io
- AFK triggered automatically after 1 minute of inactivity (no mouse/keyboard/touch)
- Multi-tab aware: user is Online if **any** tab is active; AFK only when **all** tabs are idle
- Presence indicator shown in:
  - Room member list panel
  - Contacts / friends sidebar
  - DM header
- Offline when socket disconnects (browser closed, network lost)

---

## Chat rooms

### Browsing & joining
- Browse all public rooms in the **Rooms** catalog page
- Search rooms by name in the catalog
- Join any public room with one click
- Leave a room at any time
- Private rooms: join only via invitation
- Room count badge shows number of unread messages

### Creating & managing
- Create a new room (public or private) from the sidebar
- Set room name and description on creation
- Room settings modal (owners and admins only):
  - Rename the room
  - Update description
  - Toggle public ↔ private

### Roles & permissions

| Action | Member | Admin | Owner |
|---|---|---|---|
| Send messages | ✓ | ✓ | ✓ |
| Delete own messages | ✓ | ✓ | ✓ |
| Delete any message | — | ✓ | ✓ |
| Invite users | — | ✓ | ✓ |
| Remove members | — | ✓ | ✓ |
| Ban / unban users | — | ✓ | ✓ |
| Promote to admin | — | — | ✓ |
| Demote admin | — | — | ✓ |
| Rename / re-describe room | — | ✓ | ✓ |
| Toggle public/private | — | — | ✓ |
| Delete room | — | — | ✓ |

### Invitations
- Invite any registered user by username (private rooms)
- Invitation creates a pending entry; user joins immediately when they accept

### Moderation
- Ban a member: they are removed from the room and cannot rejoin
- Unban: owner / admin can lift the ban
- Banned users see the room disappear from their sidebar
- Room deletion cascades: all messages, attachments, member records deleted

---

## Messaging

### Sending & receiving
- Real-time delivery via Socket.io (sub-second on LAN, < 3 s globally)
- Message persisted to PostgreSQL before broadcast (no lost messages on reconnect)
- Per-room monotonic sequence counter (`seq`) for gap detection and pagination

### Message actions
- **Reply** to any message — quoted snippet shown inline above the reply
- **Edit** your own message — `(edited)` indicator shown after edit
- **Delete** your own message (or any message if admin/owner) — message body replaced with `(deleted)`
- **React** with emoji — click the reaction to toggle, counts shown below message
- **Forward** a message to any room or DM you have access to
- Copy message text (browser native)

### Display
- Avatar and username shown at top of each message group (consecutive messages from same user grouped)
- Timestamp on each message (hover to see exact time)
- Date dividers between messages from different calendar days
- `(edited)` badge on modified messages
- Deleted messages shown as `(deleted)` placeholder (not removed from history)
- Inline image preview for image attachments
- Download card for non-image file attachments

### Unread tracking
- Unread count badge per room in the sidebar
- **New messages** divider line shown at first unread message when re-entering a room
- Watermark updated server-side when user opens a room
- Per-user, per-room watermark (O(1) rows — never grows with message count)

### History & pagination
- Lazy loading: 30 messages per page
- **"↑ Load older messages"** button at top of chat loads the previous page
- Loads stop when beginning of history is reached (`hasMore` flag)
- Scroll position is preserved when older messages are prepended (no viewport jump)
- Auto-scroll to bottom only when already at the live end (does not interrupt reading history)

### Typing indicators
- **"X is typing…"** shown when another user is active in the same room
- Bouncing dot animation while typing
- Space always reserved for indicator so layout does not shift when it appears/disappears
- Typing event throttled to avoid flooding the server

---

## Direct messages

- DMs require mutual friendship (both users must accept each other)
- DM thread is created automatically on first message or via **Send DM** button
- Full feature parity with rooms: replies, edits, deletes, reactions, forwarding, files, calls
- DMs appear in the sidebar under a separate section
- User-to-user ban freezes the DM: history is preserved but read-only; no new messages
- Unblock restores full access

---

## Friends & contacts

- Send a friend request to any user by username
- Receive incoming requests — shown in **Contacts** panel with Accept / Decline
- Accept request → mutual friendship created → DM becomes available
- Decline request → request removed, no notification to sender
- Cancel a sent request before it is accepted
- Remove a friend (breaks friendship, DM becomes read-only)
- Contacts list shows all friends with online/AFK/offline presence
- Block a user: blocks DM, prevents new friend requests from that user

---

## File attachments

### Upload
- Upload via **paperclip** button in message input
- Paste image directly from clipboard with **Ctrl+V / ⌘V** (no file picker needed)
- Optional text comment per attachment
- Max file size: 20 MB · Max image size: 3 MB
- MIME allowlist enforced server-side — SVG, HTML, JS, and other potentially dangerous types are rejected

### Storage & access
- Stored in MinIO (S3-compatible object storage) — not in the database
- Presigned S3 download URLs with 15-minute expiry
- Access re-checked on every download: only current room members can retrieve files
- Kicking / banning a user immediately revokes file access (no URL caching bypass)
- Files persist if the uploader leaves the room
- Files are deleted when the room is deleted (cascade)

### Display
- Images: inline preview in the message feed
- Other files: download card showing filename, size, and type icon
- Filenames included in full-text search (tsvector GIN index on `originalName`)

---

## Full-text search

- Keyboard shortcut: **⌘K** (Mac) / **Ctrl+K** (Windows/Linux)
- Searches messages **and** attachment filenames
- Scoped to rooms and DMs the current user belongs to (enforced in SQL)
- Filter syntax:
  - `in:#room-name` — limit to a specific room
  - `in:@username` — limit to DM with a specific user
  - `from:@username` — messages by a specific author
- Results show: message snippet with highlighted match, room name, author, timestamp
- **↑ / ↓** arrow keys to navigate results
- **Enter** or click to jump to the exact message in history
- After jumping, a **"↓ Jump to present"** button returns to the live feed
- Powered by PostgreSQL `tsvector` GIN index + `ts_headline()` for snippet generation
- `websearch_to_tsquery` handles natural language input (quoted phrases, negation, OR)

---

## Voice & video calls

- 1-on-1 calls only, available inside Direct Message rooms
- **Voice call** (audio only) and **video call** — separate buttons in DM header
- Call states: Ringing → Connecting → Connected
- **Mute microphone** button during call (track disabled, no bandwidth change)
- **Turn off camera** button during video call
- **Picture-in-picture** local video preview (bottom-right corner)
- Call duration timer (MM:SS) shown once connected
- Incoming call overlay shown even if the caller is in a different room
- Accept or reject incoming calls
- Hang up at any time
- Graceful error messages if microphone/camera permission is denied or device not found
- **STUN** servers for direct peer connections (Google STUN — free)
- **TURN** relay servers for NAT traversal (openrelay.metered.ca — ports 80, 443, 443/TCP)
- 4-second recovery window on network blips before tearing down
- Signaling server-side guards: call events only relayed between users with a shared DM

---

## XMPP / Jabber bridge

- ejabberd server bundled in Docker Compose (port 5222)
- Automatic account provisioning: every DAMessenger account gets a Jabber account
- Connect **any XMPP client** (Gajim, Pidgin, Conversations, etc.) using your DAMessenger credentials
- Messages sent from a Jabber client appear in the DAMessenger web UI in real time
- Messages sent from the web UI are delivered to connected Jabber clients
- Bridge uses **XEP-0114 Jabber Component Protocol** — no ejabberd source modification needed
- **Admin panel** in sidebar (XMPP Bridge page):
  - Bridge connection status (connected / disconnected)
  - Component domain and host
  - Connected-since timestamp
  - Reconnect attempt counter
  - Messages in (XMPP → Web) and messages out (Web → XMPP) counters
  - List of currently connected XMPP clients (JID, IP, client version, priority)
  - Outgoing S2S federation session count
  - Step-by-step instructions to test federation
  - Instructions to connect a Jabber client
- Auto-reconnects with 10-second backoff if the connection to ejabberd drops
- **S2S federation** (optional `--profile federation`): second ejabberd instance on separate domain (`xmpp-b.localhost`) for cross-server messaging tests

---

## Sidebar & navigation

- **Rooms** section: joined rooms sorted by unread count then name
- **Direct Messages** section: DMs with friends, sorted by recent activity
- Unread count badge per room/DM
- Room/DM icon shows presence indicator for DMs
- **+ New room** button at bottom of rooms section
- Navigation tabs: **Rooms catalog**, **Contacts**, **Sessions**, **XMPP Bridge**
- Active room highlighted
- Responsive layout: sidebar collapses on narrow viewports

---

## UI & accessibility

- Dark theme throughout (Discord-style color palette)
- Keyboard navigation: ⌘K / Ctrl+K global search, ↑↓ in search results, Enter to jump
- Message input: Enter to send, Shift+Enter for newline
- Clipboard paste for images directly into message input
- Smooth scroll-to-bottom when new messages arrive (only if already at the bottom)
- Loading spinners and skeleton states while data fetches
- Error boundaries and graceful degradation for failed API calls
- Timestamps relative (e.g. "2 hours ago") with exact time on hover
- Date dividers in message history
- Typing indicator with animated dots (layout-stable: reserved height even when empty)
- Toast/notification for call invitations regardless of current room

---

## Administration & observability

- **pgAdmin** at `localhost:5050` — full PostgreSQL GUI (credentials: `admin@admin.com` / `admin`)
- **MinIO console** at `localhost:9001` — browse and manage uploaded files (`minioadmin` / `minioadmin`)
- **XMPP Bridge admin page** — live bridge stats, connected clients, federation sessions
- Backend REST API fully accessible at `localhost:4000` for direct API testing
- Docker Compose healthchecks on all services (postgres, minio, backend)
- Idempotent seed service — runs once on first boot, skipped on restarts

---

## Developer & test tooling

- 92 backend integration tests (vitest + supertest)
- Playwright E2E call tests
- Seed dataset: 300 users, 1 000 rooms, ~12 600 000 messages, ~500 000 attachments
- Seed is idempotent — re-running `docker compose up` does not re-seed
- Test suites: auth (11), rooms (12), messages (10), watermarks (8), uploads (7), friends (8), directs (5), xmpp (22), federation (9)
- Federation load test requiring `--profile federation`
- All backend env vars have sensible defaults for local development
