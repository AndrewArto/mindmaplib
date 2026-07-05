// [[catch_all]] routing for /api/sessions/:id
// This file enables the :id parameter to be passed to sessions.ts

export const onRequest: PagesFunction = async (context) => {
  return context.next()
}
