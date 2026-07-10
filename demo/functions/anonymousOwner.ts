export interface AnonymousOwnerEnv {
  ANON_ID_SECRET: string
}

export type AnonymousOwner = {
  hash: string
  setCookie?: string
}

type LegacyOwnerMigration = (
  legacyHash: string,
  nextHash: string,
  now: string,
  expires: string,
) => Promise<boolean>

export type LegacyMigrationStatement = {
  sql: string
  params: unknown[]
}

type LegacyMigrationResult = {
  results?: Array<Record<string, unknown>>
  meta?: Record<string, unknown>
}

const ANON_COOKIE_NAME = '__Host-mml_anon_id'
const LEGACY_ANON_COOKIE_NAME = 'mml_anon_id'
const ANON_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365
const ANON_COOKIE_VALUE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/
const LEGACY_MIGRATION_GRACE_MS = 5 * 60 * 1000

function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!header) return cookies

  for (const pair of header.split(';')) {
    const [rawName, ...rawValue] = pair.trim().split('=')
    if (!rawName || rawValue.length === 0) continue
    cookies[rawName] = rawValue.join('=')
  }

  return cookies
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

function makeAnonymousToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

async function hmacSha256(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return base64UrlEncode(new Uint8Array(signature))
}

function ownerCookie(token: string): string {
  return `${ANON_COOKIE_NAME}=${token}; Path=/; Max-Age=${ANON_COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`
}

export async function runLegacyOwnerMigration(
  executeBatch: (
    statements: LegacyMigrationStatement[],
  ) => Promise<LegacyMigrationResult[]>,
  legacyHash: string,
  nextHash: string,
  now: string,
  expires: string,
): Promise<boolean> {
  const results = await executeBatch([
    {
      sql: 'DELETE FROM owner_migrations WHERE legacy_hash = ? AND expires <= ?',
      params: [legacyHash, now],
    },
    {
      sql: 'INSERT OR IGNORE INTO owner_migrations (legacy_hash, next_hash, expires) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM sessions WHERE owner_hash = ?) OR EXISTS (SELECT 1 FROM owner_bootstraps WHERE owner_hash = ?)',
      params: [legacyHash, nextHash, expires, legacyHash, legacyHash],
    },
    {
      sql: 'UPDATE sessions SET owner_hash = ? WHERE owner_hash = ? AND EXISTS (SELECT 1 FROM owner_migrations WHERE legacy_hash = ? AND next_hash = ? AND expires > ?)',
      params: [nextHash, legacyHash, legacyHash, nextHash, now],
    },
    {
      sql: 'UPDATE owner_bootstraps SET owner_hash = ? WHERE owner_hash = ? AND EXISTS (SELECT 1 FROM owner_migrations WHERE legacy_hash = ? AND next_hash = ? AND expires > ?)',
      params: [nextHash, legacyHash, legacyHash, nextHash, now],
    },
    {
      sql: 'SELECT 1 AS migrated FROM owner_migrations WHERE legacy_hash = ? AND next_hash = ? AND expires > ? LIMIT 1',
      params: [legacyHash, nextHash, now],
    },
  ])
  return (results[4]?.results?.length ?? 0) > 0
}

export async function getAnonymousOwner(
  request: Request,
  env: AnonymousOwnerEnv,
  migrateLegacyOwner?: LegacyOwnerMigration,
): Promise<AnonymousOwner> {
  if (!env.ANON_ID_SECRET) {
    throw new Error('ANON_ID_SECRET is not configured')
  }

  const cookies = parseCookies(request.headers.get('Cookie'))
  const hostToken = cookies[ANON_COOKIE_NAME]
  if (hostToken && ANON_COOKIE_VALUE_PATTERN.test(hostToken)) {
    return { hash: await hmacSha256(env.ANON_ID_SECRET, hostToken) }
  }

  const legacyToken = cookies[LEGACY_ANON_COOKIE_NAME]
  if (
    legacyToken &&
    ANON_COOKIE_VALUE_PATTERN.test(legacyToken) &&
    migrateLegacyOwner
  ) {
    const legacyHash = await hmacSha256(env.ANON_ID_SECRET, legacyToken)
    const nextToken = await hmacSha256(
      env.ANON_ID_SECRET,
      `mindmaplib:legacy-owner:${legacyToken}`,
    )
    const nextHash = await hmacSha256(env.ANON_ID_SECRET, nextToken)
    const nowDate = new Date()
    const now = nowDate.toISOString()
    const expires = new Date(
      nowDate.getTime() + LEGACY_MIGRATION_GRACE_MS,
    ).toISOString()
    if (await migrateLegacyOwner(legacyHash, nextHash, now, expires)) {
      return {
        hash: nextHash,
        setCookie: ownerCookie(nextToken),
      }
    }
  }

  const token = makeAnonymousToken()
  return {
    hash: await hmacSha256(env.ANON_ID_SECRET, token),
    setCookie: ownerCookie(token),
  }
}

export function withAnonymousOwnerCookie(
  response: Response,
  owner: AnonymousOwner,
): Response {
  if (!owner.setCookie) return response
  const headers = new Headers(response.headers)
  headers.append('Set-Cookie', owner.setCookie)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
