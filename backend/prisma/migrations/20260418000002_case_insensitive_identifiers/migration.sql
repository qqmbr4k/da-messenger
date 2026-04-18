-- Normalize existing emails and usernames to lowercase
UPDATE "User" SET "email"    = LOWER("email")    WHERE "email"    <> LOWER("email");
UPDATE "User" SET "username" = LOWER("username") WHERE "username" <> LOWER("username");

-- Drop the existing exact-match unique indexes so we can replace them
-- with expression indexes on lower() that enforce case-insensitive uniqueness.
DROP INDEX IF EXISTS "User_email_key";
DROP INDEX IF EXISTS "User_username_key";

-- Recreate as lower()-expression unique indexes
CREATE UNIQUE INDEX "User_email_key"    ON "User"(LOWER("email"));
CREATE UNIQUE INDEX "User_username_key" ON "User"(LOWER("username"));
