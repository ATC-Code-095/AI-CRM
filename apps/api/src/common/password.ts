import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

/** scrypt 哈希：$scrypt$N$salt$hash */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(plain, salt, 64).toString('hex')
  return `$scrypt$16384$${salt}$${hash}`
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (stored.startsWith('$scrypt$')) {
    const parts = stored.split('$')
    // '', scrypt, N, salt, hash
    const salt = parts[3]
    const expect = parts[4]
    const actual = scryptSync(plain, salt, 64).toString('hex')
    return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expect, 'hex'))
  }
  // 兼容旧 bcrypt（若运行环境有 bcrypt）
  try {
    const bcrypt = await import('bcrypt')
    return bcrypt.compare(plain, stored)
  } catch {
    return false
  }
}
