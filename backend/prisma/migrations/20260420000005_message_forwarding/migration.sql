ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "forwardedFromId" TEXT;

ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_forwardedFromId_fkey";
ALTER TABLE "Message" ADD CONSTRAINT "Message_forwardedFromId_fkey"
  FOREIGN KEY ("forwardedFromId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
