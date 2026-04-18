-- Drop the per-message read table (grows O(users × messages), unusable for dormant users)
DROP TABLE IF EXISTS "MessageRead";

-- Per-room sequence counter: one row per room, atomically bumped on each new message
CREATE TABLE "RoomSeq" (
    "roomId" TEXT NOT NULL,
    "seq"    BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "RoomSeq_pkey" PRIMARY KEY ("roomId")
);
ALTER TABLE "RoomSeq" ADD CONSTRAINT "RoomSeq_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add seq column to messages (nullable so existing rows stay valid)
ALTER TABLE "Message" ADD COLUMN "seq" BIGINT;
CREATE INDEX "Message_roomId_seq_idx" ON "Message"("roomId", "seq");

-- Per-user-per-room watermark: one row regardless of how many messages exist.
-- A user who disappears for years has exactly one row per room they joined.
CREATE TABLE "UserRoomWatermark" (
    "userId"  TEXT NOT NULL,
    "roomId"  TEXT NOT NULL,
    "lastSeq" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "UserRoomWatermark_pkey" PRIMARY KEY ("userId","roomId")
);
ALTER TABLE "UserRoomWatermark" ADD CONSTRAINT "UserRoomWatermark_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRoomWatermark" ADD CONSTRAINT "UserRoomWatermark_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
