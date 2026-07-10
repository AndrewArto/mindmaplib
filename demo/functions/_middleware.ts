import {
  getAnonymousOwner,
  runLegacyOwnerMigration,
  withAnonymousOwnerCookie,
  type AnonymousOwnerEnv,
} from './anonymousOwner'

interface Env extends AnonymousOwnerEnv {
  MINDMAP_DB: D1Database
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const response = await context.next()
  const url = new URL(context.request.url)
  if (url.pathname.startsWith('/api/')) return response

  const acceptsHtml = context.request.headers
    .get('Accept')
    ?.includes('text/html')
  const isHtml = response.headers.get('Content-Type')?.includes('text/html')
  if (!acceptsHtml && !isHtml) return response

  const owner = await getAnonymousOwner(
    context.request,
    context.env,
    async (legacyHash, nextHash, now, expires) =>
      runLegacyOwnerMigration(
        (statements) =>
          context.env.MINDMAP_DB.batch(
            statements.map(({ sql, params }) =>
              context.env.MINDMAP_DB.prepare(sql).bind(...params),
            ),
          ),
        legacyHash,
        nextHash,
        now,
        expires,
      ),
  )
  return withAnonymousOwnerCookie(response, owner)
}
