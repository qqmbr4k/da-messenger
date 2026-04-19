/**
 * Seed script: creates 1 000 users, 5 large public rooms, and 100 000 messages
 * spread realistically over the past 2 years.
 *
 * Run inside the backend container:
 *   docker compose exec backend npx ts-node --transpile-only seed.ts
 * Or from host with DATABASE_URL set:
 *   DATABASE_URL=... npx ts-node --transpile-only seed.ts
 */

import { PrismaClient } from '@prisma/client'
import * as argon2 from 'argon2'
import * as crypto from 'crypto'

const prisma = new PrismaClient()

// ── helpers ──────────────────────────────────────────────────────────────────

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const pick = <T>(arr: T[]): T => arr[rand(0, arr.length - 1)]

const FIRST = ['alex','blake','casey','dana','eden','finn','gray','harper','indie','jules',
  'kai','logan','morgan','noel','ocean','parker','quinn','reese','sage','taylor',
  'urban','val','wren','xen','yael','zara','aiden','briar','cedar','drew',
  'ember','forest','glen','haven','iris','jade','knox','lark','maren','nova',
  'onyx','piper','remy','skye','thorn','uma','vesper','wilder','xyla','yuki']

const LAST = ['smith','jones','brown','wilson','davis','taylor','white','martin','lee','garcia',
  'moore','jackson','harris','thompson','walker','hall','young','allen','king','wright',
  'scott','green','baker','adams','nelson','carter','hill','torres','rivera','murphy',
  'cook','cox','ward','brooks','long','gray','james','watson','foster','price']

const ROOMS = [
  { name: 'general',       description: 'General chat for everyone' },
  { name: 'random',        description: 'Anything goes' },
  { name: 'tech-chat',     description: 'Programming, tech news, dev tools' },
  { name: 'off-topic',     description: 'Memes, life, and everything else' },
  { name: 'announcements', description: 'Important updates from the team' },
]

const MESSAGES = [
  'Hey everyone!',
  'What\'s up?',
  'Good morning!',
  'Anyone around?',
  'Just pushed a fix for that nasty bug 🎉',
  "Can someone review my PR?",
  'Has anyone tried the new deployment pipeline?',
  'lol classic',
  'This is hilarious 😂',
  'Wait what?',
  'Agree 100%',
  'Not sure I follow, can you elaborate?',
  'Working on it, give me 10 minutes',
  'Done! Deployed to staging.',
  'The build is failing again…',
  'Who broke CI?? 😤',
  'It was me, sorry. Fixed now.',
  'Lunch break, bbl',
  'Back. What did I miss?',
  'Heads up: downtime scheduled for Sunday 2 AM',
  'TypeScript is love, TypeScript is life',
  'Hot take: tabs over spaces',
  'Controversial 🔥',
  'I switched to Neovim and never looked back',
  'VSCode gang rise up 🙋',
  'Anyone watching the game tonight?',
  'Just had the best coffee of my life',
  'Monday again… 😩',
  'TGIF!!!',
  'Shipping features, not bugs — mostly',
  'Remember to write tests folks',
  'Code review left on your PR, lmk if you have questions',
  'Merged! Thanks for the quick review.',
  'The docs are finally updated',
  'New version of the SDK is out, check the changelog',
  'Who wants to pair on this feature?',
  'Found a race condition in prod. Fun.',
  'Hotfix in 5… 4… 3…',
  'All good now, monitoring looks clean',
  'Happy Friday! 🍕',
  'Reading group this Thursday, bring your thoughts',
  'Pro tip: `git stash` before switching branches',
  'Docker compose up —build 🙏',
  "Anyone else's standup running long today?",
  'Retro notes are in the wiki',
  "Sprint planning at 2pm, don't forget",
  'Ship it! 🚀',
  'Incremental progress is still progress',
  'Let\'s get it 💪',
  'Took the day off, see you tomorrow',
  'Back from vacation, catching up on 500 unread messages lol',
  'Quick question: what\'s our timeout for the auth service?',
  '30 seconds, I think. Double-check the config.',
  'Found it, thanks!',
  'Random: has anyone read "A Philosophy of Software Design"?',
  'Yes! Great book, highly recommended',
  'Adding it to my list',
  'Prod alert resolved, false positive from the health check',
  'I hate Mondays',
  'Same tbh',
  'Coffee machine is broken 😭',
  'This is a crisis',
  'We are resilient. We will survive.',
  'Just discovered you can use `??=` in JS, mind blown',
  'Been using it for months lol',
  'I am perpetually behind on syntax',
  'New design mockups are ready, check Figma',
  'Looks clean! Nice work',
  'Minor tweak: the padding on mobile looks off',
  'Fixed, pushed to the design branch',
  'The latency spike from yesterday was a misconfigured CDN',
  'Classic infra issue',
  'Should we add an alert for that?',
  'Already on it 🛠',
  'End-to-end tests are green ✅',
  'Let\'s cut the release candidate',
  'On it',
  'RC tagged. Notifying stakeholders.',
  'Good work team 🎊',
]

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting seed…')

  // ── 1. create owner + rooms ────────────────────────────────────────────────
  const ownerEmail = 'owner@da-messenger.dev'
  const ownerPw = await argon2.hash('Password123!')
  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {},
    create: { email: ownerEmail, username: 'da_owner', password: ownerPw },
  })

  const roomRecords: { id: string; name: string }[] = []
  for (const r of ROOMS) {
    try {
      const room = await prisma.room.create({
        data: { name: r.name, description: r.description, type: 'PUBLIC', ownerId: owner.id },
      })
      await prisma.roomMember.create({ data: { userId: owner.id, roomId: room.id } })
      await prisma.roomAdmin.create({ data: { userId: owner.id, roomId: room.id } })
      roomRecords.push({ id: room.id, name: room.name })
      console.log(`  ✓ Room: ${room.name}`)
    } catch {
      // room name may already exist — find it
      const existing = await prisma.room.findFirst({ where: { name: r.name } })
      if (existing) roomRecords.push({ id: existing.id, name: existing.name })
    }
  }

  // ── 2. create 1 000 users ──────────────────────────────────────────────────
  const PW_HASH = await argon2.hash('Password123!') // shared hash for speed
  const BATCH = 50
  const USER_COUNT = 1000
  const userIds: string[] = [owner.id]

  console.log(`\n👥 Creating ${USER_COUNT} users…`)
  for (let i = 0; i < USER_COUNT; i += BATCH) {
    const chunk = []
    for (let j = i; j < Math.min(i + BATCH, USER_COUNT); j++) {
      const first = pick(FIRST)
      const last = pick(LAST)
      const suffix = crypto.randomBytes(3).toString('hex')
      const username = `${first}_${last}_${suffix}`
      const email = `${username}@seed.dev`
      chunk.push({ email, username, password: PW_HASH })
    }
    const created = await prisma.$transaction(
      chunk.map(u => prisma.user.upsert({ where: { email: u.email }, update: {}, create: u }))
    )
    userIds.push(...created.map(u => u.id))
    process.stdout.write(`\r  ${Math.min(i + BATCH, USER_COUNT)} / ${USER_COUNT}`)
  }
  console.log('\n  ✓ Users created')

  // ── 3. distribute users across rooms ──────────────────────────────────────
  console.log('\n🏠 Adding members to rooms…')
  for (const room of roomRecords) {
    // Each room gets between 400 and all 1001 users
    const count = room.name === 'general' ? userIds.length : rand(400, userIds.length)
    const shuffled = [...userIds].sort(() => Math.random() - 0.5).slice(0, count)
    const members = shuffled.filter(id => id !== owner.id) // owner already added
    for (let i = 0; i < members.length; i += 200) {
      const chunk = members.slice(i, i + 200)
      await prisma.roomMember.createMany({
        data: chunk.map(userId => ({ userId, roomId: room.id })),
        skipDuplicates: true,
      })
    }
    console.log(`  ✓ ${room.name}: ${members.length + 1} members`)
  }

  // ── 4. generate 100 000 messages over 2 years ─────────────────────────────
  const TOTAL_MESSAGES = 100_000
  const now = Date.now()
  const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000
  const start = now - TWO_YEARS_MS
  const MSG_BATCH = 500

  console.log(`\n💬 Generating ${TOTAL_MESSAGES} messages…`)

  // Pre-fetch room members for fast author picking
  const roomMembers: Record<string, string[]> = {}
  for (const room of roomRecords) {
    const members = await prisma.roomMember.findMany({ where: { roomId: room.id }, select: { userId: true } })
    roomMembers[room.id] = members.map(m => m.userId)
  }

  // Distribute messages: general gets ~35%, others share the rest
  const dist: Record<string, number> = {
    'general': Math.round(TOTAL_MESSAGES * 0.35),
    'random': Math.round(TOTAL_MESSAGES * 0.20),
    'tech-chat': Math.round(TOTAL_MESSAGES * 0.25),
    'off-topic': Math.round(TOTAL_MESSAGES * 0.15),
    'announcements': Math.round(TOTAL_MESSAGES * 0.05),
  }

  let totalWritten = 0
  for (const room of roomRecords) {
    const target = dist[room.name] ?? Math.round(TOTAL_MESSAGES / roomRecords.length)
    const members = roomMembers[room.id]
    if (members.length === 0) continue

    // Initialise seq counter
    let seq = 1
    const existingSeq = await prisma.roomSeq.findUnique({ where: { roomId: room.id } })
    if (existingSeq) seq = Number(existingSeq.seq) + 1

    let written = 0
    while (written < target) {
      const chunk: any[] = []
      for (let k = 0; k < MSG_BATCH && written + k < target; k++) {
        // Random timestamp, weighted toward more recent (exponential-ish)
        const progress = Math.random() ** 1.5 // bias toward recent
        const ts = new Date(start + Math.round(progress * TWO_YEARS_MS))
        chunk.push({
          roomId: room.id,
          authorId: pick(members),
          content: pick(MESSAGES),
          seq: BigInt(seq++),
          createdAt: ts,
        })
      }
      // Sort by createdAt so seq is roughly monotonic
      chunk.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      // Re-assign seq after sort
      for (let k = 0; k < chunk.length; k++) {
        chunk[k].seq = BigInt(seq - chunk.length + k)
      }
      await prisma.message.createMany({ data: chunk })
      written += chunk.length
      totalWritten += chunk.length
      process.stdout.write(`\r  ${totalWritten} / ${TOTAL_MESSAGES}`)
    }

    // Update RoomSeq
    await prisma.roomSeq.upsert({
      where: { roomId: room.id },
      create: { roomId: room.id, seq: BigInt(seq - 1) },
      update: { seq: BigInt(seq - 1) },
    })
    console.log(`\n  ✓ ${room.name}: ${written} messages`)
  }

  console.log('\n\n✅ Seed complete!')
  console.log(`   Users: ${userIds.length}`)
  console.log(`   Rooms: ${roomRecords.length}`)
  console.log(`   Messages: ~${totalWritten}`)
  console.log('\n   Login: owner@da-messenger.dev / Password123!')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
