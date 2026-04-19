-- ============================================================
-- Seed: 300 users, 1000 rooms, 3 years of messages (10-100/day)
-- Run via: docker compose exec -T postgres psql -U chat -d chat -f /seed.sql
-- ============================================================

\set ON_ERROR_STOP on

-- ── 1. Drop FTS indexes for faster bulk insert ──────────────────────────────
DROP INDEX IF EXISTS idx_message_fts;
DROP INDEX IF EXISTS idx_message_fts_live;

-- ── 2. Wipe previous seed data ──────────────────────────────────────────────
DELETE FROM "Room"  WHERE name LIKE 'seed-%';
DELETE FROM "User"  WHERE username LIKE 'seed\_%' ESCAPE '\';

-- ── 3. Create 300 seed users ────────────────────────────────────────────────
-- All share password "password123" (argon2id hash)
INSERT INTO "User" (id, email, username, password, "createdAt")
SELECT
  gen_random_uuid(),
  'seed_' || n || '@seed.test',
  'seed_user_' || n,
  '$argon2id$v=19$m=65536,t=3,p=4$NL334qTSbSGezpAScEmuLQ$wQiqsn7r7tr2LNoHdnsgwJ7SPqSCs1yz2v2dU5KbASg',
  NOW() - INTERVAL '3 years'
FROM generate_series(1, 300) AS n
ON CONFLICT DO NOTHING;

-- ── 4. Create 1000 seed rooms ───────────────────────────────────────────────
DO $$
DECLARE
  topics TEXT[] := ARRAY[
    'engineering','design','marketing','sales','support','general',
    'random','announcements','product','ops','security','data',
    'frontend','backend','mobile','infra','qa','hiring','finance','legal'
  ];
BEGIN
  INSERT INTO "Room" (id, name, description, type, "createdAt", "ownerId")
  SELECT
    gen_random_uuid(),
    'seed-' || (topics[((n-1) % 20) + 1]) || '-' || n,
    initcap(topics[((n-1) % 20) + 1]) || ' channel ' || n,
    'PUBLIC'::"RoomType",
    NOW() - INTERVAL '3 years' - (random() * INTERVAL '30 days'),
    NULL
  FROM generate_series(1, 1000) AS n;
END;
$$;

-- ── 5. Assign 10-50 random seed users to each room ──────────────────────────
DO $$
DECLARE
  room_rec RECORD;
  num_members INT;
  user_ids TEXT[];
BEGIN
  SELECT ARRAY_AGG(id) INTO user_ids FROM "User" WHERE username LIKE 'seed\_user\_%' ESCAPE '\';

  FOR room_rec IN SELECT id FROM "Room" WHERE name LIKE 'seed-%' LOOP
    num_members := 10 + floor(random() * 41)::int;

    INSERT INTO "RoomMember" ("userId", "roomId", "joinedAt")
    SELECT
      user_ids[(floor(random() * 300))::int + 1],
      room_rec.id,
      NOW() - INTERVAL '3 years' + (random() * INTERVAL '7 days')
    FROM generate_series(1, num_members)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- ── 6. Generate messages: 10-100 per room per day for 3 years ───────────────
DO $$
DECLARE
  room_rec  RECORD;
  members   TEXT[];
  nm        INT;
  vocab     TEXT[] := ARRAY[
    'Hey team, quick update on this',
    'Can someone review my PR?',
    'We need to fix this before the release',
    'Meeting notes from today',
    'Has anyone looked at the latest metrics?',
    'Reminder: standup in 10 minutes',
    'Deployed to staging, please test',
    'Found a bug in production — investigating',
    'Great work everyone on the sprint',
    'Anyone free for a quick sync?',
    'Docs updated, please review',
    'New ticket assigned, taking a look',
    'Build is failing — help needed',
    'LGTM, merging now',
    'Added unit tests for this feature',
    'Rollback complete, all systems green',
    'Dashboard is back online',
    'Performance improved 40% with this change',
    'Feature flags enabled for 10% of users',
    'Incident resolved, postmortem tomorrow',
    'Just pushed a hotfix',
    'Tests are all passing now',
    'Config updated in all environments',
    'New dependency added, please update your local',
    'Database migration ran successfully',
    'Cache invalidated, should be fine now',
    'API rate limit issue — workaround applied',
    'Onboarding the new hire today',
    'Design review scheduled for Friday',
    'Customer feedback shared in the doc',
    'Backlog grooming done, priorities updated',
    'This issue is a blocker — escalating',
    'Monthly metrics look great!',
    'Code freeze starts Monday',
    'Sync with the client went well',
    'Added feature request to the roadmap',
    'Permissions updated for the new role',
    'Load test results look solid',
    'Mobile build approved, submitting to store',
    'Legal review in progress',
    'A/B test results ready for analysis',
    'Monitoring alert was a false positive',
    'New environment provisioned',
    'Technical debt ticket created',
    'All tasks for this week completed',
    'Sharing the weekly report',
    'Question: what is the ETA on this?',
    'Looks good from my side',
    'Need more context on this one',
    'Assigning this to the next sprint'
  ];
  start_ts  TIMESTAMPTZ := NOW() - INTERVAL '3 years';
  room_total BIGINT;
BEGIN
  FOR room_rec IN SELECT id FROM "Room" WHERE name LIKE 'seed-%' LOOP
    SELECT ARRAY_AGG("userId" ORDER BY random()) INTO members
    FROM "RoomMember" WHERE "roomId" = room_rec.id;

    nm := COALESCE(array_length(members, 1), 1);

    -- Variable per-day count (10–100) via generate_series + lateral random
    WITH days AS (
      SELECT
        d AS day_num,
        start_ts + (d * INTERVAL '1 day') AS day_start,
        (3 + floor(random() * 18))::int AS daily_cnt
      FROM generate_series(0, 1094) AS d
    ),
    msgs AS (
      SELECT
        ROW_NUMBER() OVER (ORDER BY day_num, msg_n) AS seq_num,
        day_start + (msg_n::float / daily_cnt * INTERVAL '86400 seconds') AS msg_ts,
        day_num,
        msg_n
      FROM days
      CROSS JOIN LATERAL generate_series(1, daily_cnt) AS msg_n
    )
    INSERT INTO "Message" (id, "roomId", "authorId", content, seq, "createdAt")
    SELECT
      gen_random_uuid(),
      room_rec.id,
      members[((seq_num - 1) % nm)::int + 1],
      vocab[(random() * 49)::int + 1] || ' (msg ' || seq_num || ')',
      seq_num,
      msg_ts + (random() * INTERVAL '45 minutes')
    FROM msgs;

    SELECT MAX(seq) INTO room_total FROM "Message" WHERE "roomId" = room_rec.id;

    INSERT INTO "RoomSeq" ("roomId", seq) VALUES (room_rec.id, room_total)
    ON CONFLICT ("roomId") DO UPDATE SET seq = room_total;
  END LOOP;
END;
$$;

-- ── 7. Add fake attachments (~4% of messages) ───────────────────────────────
DO $$
DECLARE
  ext_list TEXT[] := ARRAY[
    'report.pdf','screenshot.png','design.fig','data.csv',
    'notes.docx','diagram.png','config.json','log.txt',
    'presentation.pptx','architecture.drawio','metrics.xlsx','readme.md'
  ];
  mime_list TEXT[] := ARRAY[
    'application/pdf','image/png','application/octet-stream','text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png','application/json','text/plain',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/octet-stream',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/markdown'
  ];
BEGIN
  INSERT INTO "Attachment" (id, "messageId", filename, "originalName", "mimeType", size, comment, "createdAt")
  SELECT
    gen_random_uuid(),
    m.id,
    gen_random_uuid()::text || '-' || ext_list[(random() * 11)::int + 1],
    ext_list[(random() * 11)::int + 1],
    mime_list[(random() * 11)::int + 1],
    (10000 + random() * 5000000)::int,
    '',
    m."createdAt"
  FROM "Message" m
  WHERE m."roomId" IN (SELECT id FROM "Room" WHERE name LIKE 'seed-%')
    AND random() < 0.04;  -- ~4% of messages
END;
$$;

-- ── 8. Rebuild FTS indexes ───────────────────────────────────────────────────
CREATE INDEX idx_message_fts ON "Message" USING GIN (search_vector);
CREATE INDEX idx_message_fts_live ON "Message" USING GIN (search_vector) WHERE "deletedAt" IS NULL;

SELECT
  (SELECT COUNT(*) FROM "User" WHERE username LIKE 'seed\_user\_%' ESCAPE '\') AS seed_users,
  (SELECT COUNT(*) FROM "Room" WHERE name LIKE 'seed-%') AS seed_rooms,
  (SELECT COUNT(*) FROM "Message" m JOIN "Room" r ON r.id = m."roomId" WHERE r.name LIKE 'seed-%') AS seed_messages,
  (SELECT COUNT(*) FROM "Attachment" a JOIN "Message" m ON m.id = a."messageId" JOIN "Room" r ON r.id = m."roomId" WHERE r.name LIKE 'seed-%') AS seed_attachments;
