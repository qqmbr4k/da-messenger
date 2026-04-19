-- Full-text search: generated tsvector column on Message.content
ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_message_fts ON "Message" USING GIN (search_vector);

-- FTS on Attachment filenames (simple config — filenames are not natural language)
CREATE INDEX IF NOT EXISTS idx_attachment_name_fts
  ON "Attachment" USING GIN (to_tsvector('simple', "originalName"));

-- ── Supporting indexes for common query patterns ───────────────────────────

-- Message: filter by author
CREATE INDEX IF NOT EXISTS idx_message_authorId ON "Message" ("authorId");

-- Message: sort/filter by createdAt
CREATE INDEX IF NOT EXISTS idx_message_createdAt ON "Message" ("createdAt" DESC);

-- Message: room + non-deleted for timeline queries
CREATE INDEX IF NOT EXISTS idx_message_room_live
  ON "Message" ("roomId", "seq" DESC)
  WHERE "deletedAt" IS NULL;

-- Message: FTS filtered to non-deleted rows
CREATE INDEX IF NOT EXISTS idx_message_fts_live ON "Message" USING GIN (search_vector)
  WHERE "deletedAt" IS NULL;

-- Session: look up sessions by userId (logout all, list sessions)
CREATE INDEX IF NOT EXISTS idx_session_userId ON "Session" ("userId");

-- Reaction: look up all reactions for a message
CREATE INDEX IF NOT EXISTS idx_reaction_messageId ON "Reaction" ("messageId");

-- Attachment: look up all attachments for a message
CREATE INDEX IF NOT EXISTS idx_attachment_messageId ON "Attachment" ("messageId");

-- RoomMember: look up all rooms for a user (membership checks, sidebar list)
CREATE INDEX IF NOT EXISTS idx_roomMember_userId ON "RoomMember" ("userId");

-- RoomMember: look up all members in a room (presence, member panel)
CREATE INDEX IF NOT EXISTS idx_roomMember_roomId ON "RoomMember" ("roomId");

-- FriendRequest: look up requests sent by or to a user
CREATE INDEX IF NOT EXISTS idx_friendRequest_requesterId ON "FriendRequest" ("requesterId");
CREATE INDEX IF NOT EXISTS idx_friendRequest_recipientId ON "FriendRequest" ("recipientId");

-- Friendship: both directions
CREATE INDEX IF NOT EXISTS idx_friendship_userAId ON "Friendship" ("userAId");
CREATE INDEX IF NOT EXISTS idx_friendship_userBId ON "Friendship" ("userBId");

-- UserRoomWatermark: look up watermarks for a user
CREATE INDEX IF NOT EXISTS idx_watermark_userId ON "UserRoomWatermark" ("userId");
