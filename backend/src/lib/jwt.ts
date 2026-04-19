import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'supersecretjwtkey_change_in_prod'
const EXPIRES_IN = '30d'

export function signToken(payload: { userId: string; sessionId: string }) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN })
}

export function verifyToken(token: string): { userId: string; sessionId: string } {
  return jwt.verify(token, SECRET) as { userId: string; sessionId: string }
}
