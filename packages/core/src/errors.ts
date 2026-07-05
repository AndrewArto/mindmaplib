// Error types for @mindmaplib/core.

export type MindmapErrorCode =
  | 'NODE_NOT_FOUND'
  | 'ROOT_IMMUTABLE'
  | 'CYCLE_DETECTED'
  | 'INVALID_CONTENT'
  | 'INVALID_POSITION'
  | 'SCHEMA_MISMATCH'
  | 'MALFORMED_JSON'
  | 'DOC_INVARIANT_VIOLATION'
  | 'INVALID_TRANSACTION'

/**
 * Thrown for all document operation, validation, and serialization failures.
 */
export class MindmapError extends Error {
  readonly code: MindmapErrorCode
  readonly nodeId?: string

  constructor(message: string, code: MindmapErrorCode, nodeId?: string) {
    super(message)
    this.name = 'MindmapError'
    this.code = code
    this.nodeId = nodeId
  }
}

/**
 * Thrown when a transaction is applied in strict mode and its baseVersion does
 * not match the current document version.
 */
export class VersionConflictError extends Error {
  readonly expected: number
  readonly actual: number
  readonly transactionId: string

  constructor(expected: number, actual: number, transactionId: string) {
    super(
      `Version conflict: transaction ${transactionId} expected baseVersion ` +
        `${expected} but document version is ${actual}`,
    )
    this.name = 'VersionConflictError'
    this.expected = expected
    this.actual = actual
    this.transactionId = transactionId
  }
}

export type StoreErrorCode =
  'NOT_FOUND' | 'PERMISSION_DENIED' | 'QUOTA_EXCEEDED' | 'CORRUPT_DOCUMENT'

/**
 * Infrastructure-level store failure (permissions, quota, corruption).
 * VERSION_CONFLICT is NOT thrown by save(); it is returned as
 * SaveResult.conflict = true.
 */
export class StoreError extends Error {
  readonly code: StoreErrorCode

  constructor(message: string, code: StoreErrorCode) {
    super(message)
    this.name = 'StoreError'
    this.code = code
  }
}
