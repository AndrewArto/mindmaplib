import { deserialize, serialize } from '@mindmaplib/core'

export const MAX_DOCUMENT_BYTES = 256 * 1024
export const MAX_REQUEST_BYTES = 1024 * 1024
export const MAX_SESSIONS_PER_OWNER = 50
export const MAX_SESSIONS_GLOBAL = 10_000

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

export class ApiRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

export function assertValidSessionId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !SESSION_ID_PATTERN.test(value)) {
    throw new ApiRequestError('Invalid session id', 400)
  }
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

async function readRequestTextWithLimit(request: Request): Promise<string> {
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_REQUEST_BYTES) {
        try {
          await reader.cancel('Request body is too large')
        } catch {
          // Cancellation is best-effort; overflow must still be reported as 413.
        }
        throw new ApiRequestError('Request body is too large', 413)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

export function assertWriteProvenance(request: Request): void {
  const requestOrigin = new URL(request.url).origin
  const origin = request.headers.get('Origin')
  if (origin && origin !== requestOrigin) {
    throw new ApiRequestError('Cross-origin writes are not allowed', 403)
  }

  const fetchSite = request.headers.get('Sec-Fetch-Site')?.toLowerCase()
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    throw new ApiRequestError('Cross-site writes are not allowed', 403)
  }
}

export function assertDocumentWriteRequestAllowed(request: Request): void {
  assertWriteProvenance(request)
  const mediaType = request.headers
    .get('Content-Type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase()
  if (mediaType !== 'application/json') {
    throw new ApiRequestError('Content-Type must be application/json', 415)
  }
}

export async function readDocumentRequest<T extends { doc: string }>(
  request: Request,
): Promise<T> {
  assertDocumentWriteRequestAllowed(request)
  const contentLength = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new ApiRequestError('Request body is too large', 413)
  }

  const text = await readRequestTextWithLimit(request)

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new ApiRequestError('Invalid JSON body', 400)
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !Object.hasOwn(body, 'doc') ||
    typeof (body as { doc?: unknown }).doc !== 'string'
  ) {
    throw new ApiRequestError('A serialized document is required', 400)
  }

  const submittedDoc = (body as { doc: string }).doc
  if (utf8ByteLength(submittedDoc) > MAX_DOCUMENT_BYTES) {
    throw new ApiRequestError('Document is too large', 413)
  }

  let canonicalDoc: string
  try {
    const document = deserialize(submittedDoc)
    assertValidSessionId(document.id)
    canonicalDoc = serialize(document)
  } catch {
    throw new ApiRequestError('Invalid serialized document', 400)
  }
  if (utf8ByteLength(canonicalDoc) > MAX_DOCUMENT_BYTES) {
    throw new ApiRequestError('Document is too large', 413)
  }

  const expectedVersion = (body as { expectedVersion?: unknown })
    .expectedVersion
  if (
    expectedVersion !== undefined &&
    (typeof expectedVersion !== 'number' ||
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 0)
  ) {
    throw new ApiRequestError(
      'expectedVersion must be a non-negative integer',
      400,
    )
  }

  const bootstrapKind = (body as { bootstrapKind?: unknown }).bootstrapKind
  if (bootstrapKind !== undefined && bootstrapKind !== 'first-visit-sample') {
    throw new ApiRequestError('Invalid bootstrapKind', 400)
  }

  ;(body as { doc: string }).doc = canonicalDoc
  return body as T
}
