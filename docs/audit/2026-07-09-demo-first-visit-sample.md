# Change Evidence: demo first-visit sample map

Date: 2026-07-09 to 2026-07-10
Agent: Stevens
Commit(s): pending
Request/issue: first-time demo visitors should see a sample map instead of an empty workspace.

## Scope

- User-visible behavior:
  - A new anonymous owner with an authoritative empty D1 session list gets the built-in sample persisted and opened automatically.
  - The sample appears in Saved maps and participates in the existing two-second autosave flow.
  - A failed/non-JSON initial list never triggers a write; the local sample remains visible with an error state.
  - Deleting the seeded sample does not recreate it for the same anonymous owner.
  - A new owner after cookie rotation remains eligible because bootstrap state is scoped server-side by `owner_hash`, not browser `localStorage`.
  - Concurrent first-visit requests for one owner create at most one sample.
  - Stale list, load, create, and save responses do not replace newer user state, including an in-progress drag with no version bump yet.
  - Adding an empty node in auto-layout and pressing Cmd+Z removes it in one undo step; it no longer reappears at the canvas origin as a second root.
- Package(s) affected:
  - demo UI and D1 store.
  - Cloudflare Worker/Pages Function and D1 schema.
  - `@mindmaplib/core` for `MindmapEditor.markSaved()` after host-managed persistence.
- Files intentionally changed:
  - `.changeset/clean-sample-bootstrap.md`
  - `demo/apiLimits.ts`
  - `demo/functions/_middleware.ts`
  - `demo/functions/anonymousOwner.ts`
  - `demo/functions/api/[[catch_all]].ts` (removed)
  - `demo/functions/api/sessions.ts`
  - `demo/functions/api/sessions/[id].ts`
  - `demo/migrations/003_owner_bootstrap.sql`
  - `demo/package.json`
  - `demo/pages/sessionHandlers.ts`
  - `demo/src/App.tsx`
  - `demo/src/d1store.ts`
  - `demo/tests/App.test.tsx`
  - `demo/tests/apiLimits.test.ts`
  - `demo/tests/d1store.test.ts`
  - `demo/tests/pages-sessions.test.ts`
  - `demo/tests/test-globals.d.ts`
  - `demo/tests/worker.test.ts`
  - `demo/tsconfig.tests.json`
  - `demo/worker.ts`
  - `docs/audit/2026-07-09-demo-first-visit-sample.md`
  - `packages/core/src/content.ts`
  - `packages/core/src/editor.ts`
  - `packages/core/tests/content.test.ts`
  - `packages/core/tests/editor.test.ts`
  - `packages/react/tests/useKeyboard.test.tsx`
  - `pnpm-lock.yaml`
- Files intentionally not touched:
  - `packages/react/src/**`
- Operational change:
  - Apply `demo/migrations/003_owner_bootstrap.sql` to the production D1 database before deploying the Worker that uses `owner_bootstraps` and the short-lived `owner_migrations` handoff table.
  - No new Cloudflare secret is required.
- Both the advanced Worker and Pages Functions path establish the anonymous owner cookie on the HTML document response before the browser can issue concurrent API requests.

## Design

- Initial session listing must succeed with JSON before the client may seed anything.
- Seeding uses `D1Store.bootstrapFirstVisitSample()` and POSTs `bootstrapKind: "first-visit-sample"`.
- D1 stores one `owner_bootstraps` row per anonymous `owner_hash`.
- A transactional D1 batch performs:
  1. `INSERT OR IGNORE` of the owner bootstrap marker with a per-request claim ID.
  2. Conditional insertion of the sample only for the request whose claim created that marker; an identical retry cannot recreate a deleted sample.
  3. Conditional cleanup of a newly claimed marker if a global session-ID collision prevented its owner-scoped session insert.
  4. Selection of the authoritative seeded session.
- The marker remains after session deletion, so later empty lists do not recreate the sample.
- No document data or bootstrap identity is stored in `localStorage`.
- Request generations plus document object-identity guards prevent stale list/load responses from committing after edits or an in-progress drag.
- `MindmapEditor.markSaved(version)` accepts only the current document version. It cannot move optimistic concurrency to an unrelated server version.
- A same-mode layout pass immediately following an add/move is folded into the structural undo unit, so undo never exposes the intermediate null-position node at canvas origin.
- Semantically unchanged canonical content updates are no-ops and do not consume an undo step; noncanonical stored content is normalized on update.
- Write endpoints require JSON and same-origin browser provenance, validate and canonicalize serialized documents before owner resolution, stream request bodies through a 1 MiB cap, and limit serialized documents and session counts.
- Legacy owner rotation derives one domain-separated replacement token and uses a five-minute `owner_migrations` handoff marker. One atomic D1 batch creates or reuses the marker, rekeys both ownership tables, and verifies the handoff, so concurrent tabs receive the same protected cookie. After expiry, the legacy bearer no longer resolves the migrated owner.
- Normal create uses deterministic `INSERT OR IGNORE` classification in one D1 batch: exact same-owner retries are idempotent, ID collisions return 409, and quota-only rejections return 429 from the same transaction snapshot.
- Interaction locks are token-owned, so stale operation completion cannot unlock a newer mutation.

## Impact Analysis

- Symbols checked:
  - `App` initialization effect.
  - `loadSession`, `refreshSessions`, and `persistNewDocument`.
  - `D1Store.list/create/load/save/bootstrapFirstVisitSample`.
  - Worker POST/GET/PUT/DELETE routes.
  - `MindmapEditor.markSaved`, `isDirty`, `setLayout`, `updateContent`, and undo history.
- Risk level: HIGH.
- Reasons:
  - Async startup races can overwrite user documents.
  - D1 bootstrap must be owner-scoped and idempotent.
  - `markSaved` is exported package API and affects optimistic concurrency.
  - Structural edits plus derived layout must remain one undo unit.
- Breaking change: no.
- Public API change: additive `MindmapEditor.markSaved()` helper; patch changeset included.

## TDD Evidence

### Original feature cycles

1. Empty first list did not POST a sample. The first App test failed on `createdDocId`; startup bootstrap made it green.
2. Selection-only interaction cancelled bootstrap. A regression test failed; document-only identity guards made it green.
3. A late bootstrap create overwrote a newer document. A delayed-create test failed; stale document guards made it green.
4. A late bootstrap replaced the current Saved maps row. A delayed-create/sidebar test failed; guarded functional session updates made it green.
5. Active editing was replaced by startup autoload. A delayed-list/edit test failed; edit-aware autoload guards made it green.
6. StrictMode replay created duplicate requests. A StrictMode test established one shared bootstrap promise.
7. Same-document edits during create were not persisted. A delayed-create test failed; save-until-current attachment made it green.
8. Host-managed persistence left the editor dirty baseline stale. Core tests failed before `markSaved()` existed; the new API made them green.
9. Edits during bootstrap save could be lost or marked clean too early. Delayed-save tests failed; the save-until-current loop made them green.

### Final review remediation cycles

10. Unsafe explicit saved version:
    - Red: `pnpm exec vitest run --project core packages/core/tests/editor.test.ts -t "markSaved rejects"`.
    - Failure: `markSaved(7)` did not throw for a version-1 document.
    - Green: `markSaved` now rejects any version other than the current document revision.
11. Non-authoritative empty list:
    - Red: `pnpm exec vitest run --project demo demo/tests/d1store.test.ts -t "rejects a non-JSON list response"`.
    - Failure: non-JSON HTTP 200 resolved to `[]`.
    - Green: `D1Store.list()` throws an explicit response error.
12. Concurrent owner bootstrap:
    - Red: `pnpm exec vitest run --project demo demo/tests/worker.test.ts -t "creates the first-visit sample at most once"`.
    - Failure: two requests returned different IDs and created two sessions.
    - Green: transactional owner bootstrap marker and conditional session insert.
13. Client atomic bootstrap protocol:
    - Red: focused App test required `bootstrapKind`; existing `store.create()` omitted it and the sample never attached.
    - Green: App uses `bootstrapFirstVisitSample()`.
14. Stale existing-session load:
    - Red: delayed GET resolved after a local edit and replaced the sample with the saved session.
    - Green: load generation plus post-await editor-state guard.
15. Stale initial list:
    - Red: delayed initial list resolved after manual create and removed the refreshed row.
    - Green: list request generation plus document identity guard.
16. Identical bootstrap retry after deletion:
    - Red: retrying the same serialized document recreated the deleted sample because the retained marker still matched its session ID.
    - Green: the marker stores a per-request claim ID and insertion is gated on that claim.
17. In-progress drag versus startup autoload:
    - Red: a delayed load replaced a drag because `setPositionDirect()` changes the document without changing its version.
    - Green: autoload now requires the exact original document object as well as matching ID/version/editing state.
18. Empty-node undo at canvas origin:
    - Red: one undo after Tab insertion restored the intermediate pre-layout document, leaving the node at null position (`0,0`) like a second root.
    - Green: the derived same-mode layout pass is merged into the preceding add/move undo unit.
19. Empty content no-op:
    - Red: persisting unchanged empty content created an extra undo entry.
    - Green: semantically identical normalized content updates no longer mutate history or version.
20. Pages Functions bootstrap parity:
    - Red: a behavioral Pages handler test showed the duplicate handler omitted the required `claim_id` column and bound the document ID as the claim.
    - Green: Pages Functions now generates and binds the same per-request claim protocol as the advanced worker.
21. Layout merge state across document load:
    - Red: loading a new document after an add left stale structural transaction state, so its first same-mode layout had no undo snapshot.
    - Green: an explicit one-shot layout-merge marker is consumed by layout and cleared by load, undo, redo, drag, and other history boundaries.
22. Measurement-only startup relayout:
    - Red: a delayed startup load was discarded after ResizeObserver measurement changed document object identity without a user edit.
    - Green: startup snapshots now compare document ID/version and the last user transaction token, so measurement-only relayouts remain eligible while direct drags and edits invalidate autoload.
23. Refresh failure after successful persistence:
    - Red: a failed sidebar list refresh after successful create caused local fallback, cleared the active URL, and reported Save failed.
    - Green: refresh failures are isolated, reported separately, and no longer unwind successful create/save state.
24. Explicit create versus delayed startup autoload:
    - Red: a delayed initial list could start a later automatic load and supersede an already-persisted manual New map load.
    - Green: explicit open/create actions advance a user-intent generation; initialization checks the captured generation before starting or applying automatic list/load/bootstrap work.
25. Concurrent bootstrap load versus manual create:
    - Red: another tab's bootstrap sample load could apply after a newer manual create intent but before that create's POST returned.
    - Green: the bootstrap load's apply guard now rechecks startup user intent at response time.
26. Delete followed by failed list refresh:
    - Red: successful DELETE followed by non-JSON list response left the deleted row active and caused an unhandled rejection.
    - Green: delete removes local row/active state immediately, then uses the handled refresh path; refresh failure is reported without restoring deleted state.
27. Stale startup rejection:
    - Red: a delayed initial list rejection replaced a newer successful manual create's Saved state with Save failed.
    - Green: initialization errors are ignored when either captured user intent or list request generation is stale.
28. Out-of-order explicit creates:
    - Red: an older delayed create response could open over a newer successful create.
    - Green: each explicit create captures its own intent generation and rechecks it after every asynchronous boundary and before fallback.
29. DELETE transport failure:
    - Red: D1Store.delete treated HTTP 500 as success.
    - Green: delete now rejects non-successful responses before App reconciles local state.
30. Other-tab bootstrap sidebar reconciliation:
    - Red: loading the authoritative sample created by another tab left the sidebar empty.
    - Green: successful authoritative sample load is followed by a handled list refresh.
31. Bootstrap-edit save conflict:
    - Red: a conflict while saving edits made during bootstrap left the created server session unattached and silent.
    - Green: the session is attached before catch-up save; conflict/error remains visible and later edits retain autosave eligibility.
32. Stale autosave completion:
    - Red: a rejected save from the previous document published Save failed after a newer document opened.
    - Green: saves carry a save-operation generation and editor identity; document actions invalidate pending/in-flight save effects.
33. Delete replacement load failure:
    - Red: deleting the active row and failing to load its replacement left the deleted editor visible.
    - Green: active id, URL, and editor are cleared to a local blank document before any guarded replacement load.
34. Async document action ordering:
    - Red: import/rename/duplicate/delete completions and errors could commit after newer user intent.
    - Green: each action captures intent at invocation, invalidates pending saves, rechecks after every await, uses guarded loads, and handles current errors only.
35. Queued autosave preservation across document switches:
    - Red: a dirty saved map switched before the debounce fired never reached D1 because action invalidation cleared its only timer.
    - Green: debounces are tracked per editor; switching invalidates stale UI effects without canceling the old editor's queued persistence, while explicit pre-action saves cancel only their own editor timer.
36. Per-editor save serialization and bootstrap ordering:
    - Red review: normal autosave could race bootstrap catch-up or another save using the same optimistic baseline.
    - Green: all writes for an editor are serialized through a per-editor promise queue; bootstrap catch-up is registered before attachment and normal autosaves execute only after its baseline is marked saved.
37. Same-document reopen ordering:
    - Red: reopening a dirty document before its debounce fired loaded stale D1 data before the queued PUT.
    - Green: loadSession flushes and awaits queued/in-flight saves for the target document before issuing GET; the regression asserts load-save-load request order.
38. Background autosave failure recovery:
    - Red: a save rejected after switching documents was forgotten, and reopening loaded stale D1 content.
    - Green: failed dirty editors remain addressable by document ID and are retried before a later load or document action.
39. Same-document edits during GET:
    - Red: a local edit made after the pre-load flush was replaced when the older GET completed.
    - Green: loadSession captures the source editor transaction snapshot and refuses to apply a response after user-visible editor changes.
40. Inactive rename and duplicate ordering:
    - Red: row actions read stale D1 content while the inactive document still had a queued save.
    - Green: inactive document actions flush that document's timer, queue, or failed save before rename or duplicate reads it.
41. Bootstrap session-ID collision:
    - Red: an ignored session insert left a permanent owner bootstrap marker with no session.
    - Green: the same D1 batch conditionally removes a newly claimed marker whose matching owner session does not exist, allowing a later retry.
42. Refresh during first-visit initialization:
    - Red: Refresh advanced the list generation and cancelled the only bootstrap path.
    - Green: Refresh is disabled until initialization settles, so the authoritative startup list completes bootstrap exactly once.
43. Bootstrap catch-up failure retention:
    - Red: a catch-up conflict removed the last retry path, and a generic retry would have used the pre-bootstrap constructor baseline.
    - Green: the failed operation retains a custom per-document retry closure with the authoritative persisted version; reopen retries PUT before any GET and preserves local edits.
44. Edit during the pre-load save flush:
    - Red: an edit made while the flushed PUT was pending became the post-flush snapshot and was then replaced by GET.
    - Green: loadSession captures the source transaction snapshot before flush and aborts before GET if the editor changes during persistence.
45. Existing-owner migration backfill:
    - Red: migration 003 created an empty marker table, making existing anonymous owners eligible again after deleting their last map.
    - Green: migration 003 inserts one durable marker per existing non-null owner_hash before the new bootstrap handler is deployed.
46. Active rich-text document replacement:
    - Red: New/Sample/open actions could replace the editor while TipTap still held uncommitted node text.
    - Green: document replacement is rejected while editingNodeId is active, including a defensive check inside loadSession.
47. Async completion after App unmount:
    - Red: a deferred create could continue into GET and URL mutation after the component had unmounted.
    - Green: cleanup invalidates user-intent, load, list, and save generations before clearing pending lifecycle state.
48. Retained bootstrap retry versus normal autosave:
    - Red: a later normal autosave bypassed the retained authoritative bootstrap task and submitted the constructor baseline.
    - Green: enqueueEditorSave dispatches the retained per-document task before the generic editor.save path.
49. Successful create with canceled follow-up load:
    - Red: a server-created session remained absent from the sidebar when a concurrent edit canceled its follow-up load.
    - Green: create/import/duplicate/rename flows reconcile the authoritative session list after successful server mutation even when editor replacement is canceled.
50. Editing that begins during a failing create:
    - Red: late POST failure replaced the newly edited source with the local fallback document.
    - Green: persistNewDocument retains its source snapshot and preserves the current editor whenever state changed while create was pending.
51. Editing that begins during active delete:
    - Red: successful DELETE unconditionally installed a blank editor and detached active TipTap content.
    - Green: active delete snapshots the source; if it changes before completion, the deleted session is detached while its local editor is kept as an explicit recovery document.
52. Stale successful mutation ordering:
    - Red: an older create that committed after a newer action's list refresh remained hidden because its stale intent returned before reconciliation.
    - Green: every confirmed create/import/rename/duplicate/delete reconciles the authoritative list while mounted, independently from editor and URL intent.
53. Session-list error recovery:
    - Red: a successful retry updated rows but left the earlier list failure banner visible.
    - Green: list failures are tracked separately and successful authoritative list responses clear only the matching list-owned error.
54. Normal-create owner tracking:
    - Red: a normal map could be created and deleted without a durable owner_bootstraps marker, restoring first-visit eligibility.
    - Green: both advanced worker and Pages Function atomically batch an owner marker with every normal session insert.
55. Active-delete replacement source:
    - Red: delete selected a replacement from stale React state and installed a blank editor before the guarded load could complete.
    - Green: reconciliation returns authoritative rows; delete loads their first row against the unchanged source editor and installs blank only as a post-load fallback.
56. Queued save after unmount:
    - Red: clearing the queue map did not cancel an already registered promise callback, which started a second PUT after cleanup.
    - Green: every queued task captures a lifecycle generation and refuses to start or publish completion once that generation ends.
57. Bootstrap iteration after unmount:
    - Red: an in-flight catch-up PUT could resolve after cleanup and cause the loop to issue another PUT.
    - Green: the bootstrap loop checks lifecycle generation before and after every save and does not retain canceled retries.
58. Chained document actions after unmount:
    - Red: duplicate and rename could continue from a deferred GET into POST or PUT after the App had unmounted.
    - Green: D1Store accepts a continuation predicate between GET and mutation; App passes the operation intent, and duplicate returns no ID when canceled.
59. Edit during active-delete replacement load:
    - Red: a guarded replacement GET correctly declined to overwrite a new edit, but delete then fell through to a blank fallback and discarded it.
    - Green: delete carries its operation-start source guard through replacement loading and rechecks it before any blank fallback, retaining changed local state as recovery.
60. Transient row-load failure:
    - Red: every non-OK or non-JSON response was treated as a missing session and detached the still-visible active document.
    - Green: D1Store returns null only for 404, throws for transient or malformed responses, and loadSession never detaches an existing active map on a failed attempt.
61. Document-action source interval:
    - Red: successful create could replace edits committed while its POST was pending because loadSession captured its baseline only after mutation and reconciliation.
    - Green: create/sample/import/rename/duplicate/delete carry one operation-start editor snapshot through every asynchronous boundary and replacement attempt.
62. Superseded delete reconciliation:
    - Red: a concurrent manual Refresh superseded post-delete list reconciliation, causing delete to fall back to stale render-time rows.
    - Green: superseded list requests chain to the latest request promise, so mutation callers receive the newest authoritative rows or a real failure.
63. Inactive row action versus active autosave:
    - Red: an inactive rename incremented a global save generation; the active autosave still committed but could no longer publish Saved or an error.
    - Green: save generations are scoped per editor, and inactive rename/delete do not invalidate the active editor's save lifecycle.
64. Active rename optimistic baseline:
    - Red: source edits during the rename GET could still advance into a stale PUT; edits during the PUT could leave the local editor behind the committed server version.
    - Green: active rename carries its source guard into D1Store continuation and makes the workspace inert for the full GET/PUT/load interval, while topbar actions may still supersede it by intent.
65. Duplicate source interval:
    - Red: a source change during duplicate GET still allowed creation of a stale server-side copy.
    - Green: duplicate uses the combined intent and source predicate before POST and holds the workspace interaction lock through the mutation.
66. Pages owner-cookie bootstrap:
    - Red: the Pages Functions path minted owner tokens independently in concurrent first API requests because only the advanced Worker bootstrapped the HTML response.
    - Green: root Pages middleware sets the anonymous owner cookie on the HTML response using a shared helper; a behavioral test sends concurrent list/create with that cookie and verifies one owner hash.
67. Active-delete recovery autosave:
    - Red: an edit made during DELETE scheduled a new debounce after the initial invalidation; local recovery later PUT the deleted ID and replaced its recovery message with Save failed.
    - Green: successful delete tombstones every editor instance for that document, cancels timers and retained failures at detach, and prevents queued network saves from starting.
68. Keyboard bypass of interaction lock:
    - Red: document-level Cmd/Ctrl+Z/Y bypassed inert workspace semantics and mutated the editor during rename PUT.
    - Green: the App capture listener consumes global undo/redo while the interaction lock is active before CanvasView's document listener can execute.
69. Topbar supersession lock lifetime:
    - Red: a genuinely pending duplicate POST kept the replacement editor inert after New map superseded it.
    - Green: topbar document creation releases the stale workspace lock immediately; the old operation remains intent-guarded.
70. Pages item routing:
    - Red: no dynamic route file existed for `/api/sessions/:id`, so Pages item CRUD fell through the route graph.
    - Green: exact and item routes re-export a shared implementation with strict method sets; Wrangler 4.110.0 generated exactly GET/POST for `/api/sessions` and GET/PUT/DELETE for `/api/sessions/:id`.
71. Anonymous-owner cookie fixation and compatibility:
    - Red: the legacy non-prefixed bearer cookie could be fixed by a sibling domain, while a naive rename would strand returning owners.
    - Green: both runtimes prefer `__Host-mml_anon_id`; legacy tokens migrate only when their HMAC owner hash already has sessions or a bootstrap marker, otherwise they rotate.
72. Anonymous storage-abuse bounds:
    - Red: POST/PUT parsed unbounded bodies and creates had no row caps.
    - Green: shared parsing enforces 1 MiB request and 256 KiB serialized-document limits; atomic create SQL caps 50 sessions per owner and 10,000 globally in Worker and Pages.
73. Test and Functions TypeScript coverage:
    - Red: demo CI typechecked only `src`; missing test types and Cloudflare handler type errors were invisible.
    - Green: strict `tsconfig.tests.json` covers tests, Functions, Worker, and limits using official Cloudflare types; deferred test values use runtime assertions rather than weakened types.
74. Delete/save tombstone lifecycle:
    - Red: queued saves could start after DELETE, late failures could restore retry state, inactive editor timers survived row deletion, and failed DELETE lost the active debounce.
    - Green: a separate per-editor cancellation epoch is checked immediately before PUT and before failure retention, bootstrap retries honor it, successful delete cancels every editor instance for the document twice across reconciliation, and cancellation begins only after DELETE succeeds.
75. Chunked request-size enforcement:
    - Red: requests without `Content-Length` were fully buffered by `request.text()` before the 1 MiB check.
    - Green: the shared parser reads byte chunks through a capped reader, cancels the stream immediately on overflow, and never consumes the remaining body.
76. Write-request provenance:
    - Red: `text/plain` and same-site sibling-origin POSTs reached D1 and could consume a victim owner's quota.
    - Green: shared Worker/Pages parsing requires `application/json`, rejects mismatched `Origin`, and accepts only same-origin or browser-none Fetch Metadata when present.
77. Advanced Worker route aliases:
    - Red: `/api/sessionsfoo`, nested item paths, and a trailing slash entered collection/item handlers.
    - Green: the Worker recognizes only exact `/api/sessions` and one-segment `/api/sessions/:id`, matching the generated Pages graph.
78. Interaction-lock ownership:
    - Red: an old duplicate completion could clear the lock owned by a newer pending rename after New map force-unlocked the first operation.
    - Green: every lock has a monotonically generated owner token; operation `finally` releases only its own token, while topbar supersession invalidates it.
79. Stale DELETE UI ownership:
    - Red: delayed DELETE completion detached a newer active map and could clear the URL after unmount before checking intent.
    - Green: active-state and history mutations require mounted lifecycle, current intent, and matching current active ID; server reconciliation remains independent.
80. Content canonicalization and revision evidence:
    - Red: normalized equality could preserve disallowed marks already present in stored content, and the repeated revision assertion was tautological.
    - Green: canonical empty content is consistent across constructors and normalization, `updateContent` compares stored content to canonical output, and tests assert every observed revision is unique and exact.
81. Rejected-write owner mutation:
    - Red: invalid/cross-site writes resolved an anonymous owner first and could emit a newly minted cookie or consume a legacy owner before rejecting the body.
    - Green: provenance plus full document parsing/canonicalization run before owner resolution; all validation errors return without `Set-Cookie` or D1 owner mutation.
82. Legacy bearer replay:
    - Red: accepted legacy tokens were copied directly into the protected cookie and remained valid indefinitely.
    - Green: a fresh token/hash is generated, sessions and bootstrap rows are atomically rekeyed, and the old hash has no rows after migration; Worker replay and Pages rekey tests cover both runtimes.
83. Server document/version validation:
    - Red: arbitrary strings, malformed documents, route-unsafe IDs, and invalid expected versions could reach SQL.
    - Green: shared parsing uses core deserialize/validate/serialize, a bounded route-safe document ID, canonical persistence, and non-negative integer expected versions.
84. Normal-create retries and collisions:
    - Red: a repeated POST or global document-ID collision could escape as an unstructured primary-key failure.
    - Green: normal creates use `INSERT OR IGNORE`, then classify exact same-owner retries as 200, collisions as 409, and quota-only rejection as 429 without exposing another owner.
85. Same-ID reopen during DELETE:
    - Red: a newer intent could reopen the same session ID while DELETE was pending, leaving a deleted D1 row attached and autosaving to 404.
    - Green: successful deletion detaches any currently active editor with the deleted ID independently of stale intent, preserves its content locally, clears the URL, and tombstones saves.
86. Create lock transfer:
    - Red: New/Sample globally unlocked a pending rename/duplicate and exposed the old workspace while create/load was still pending.
    - Green: create atomically takes a newer owner token and holds inert through create/load/fallback; stale finalizers cannot release it.
87. Behavioral D1 SQL verification:
    - Real SQLite with migrations 001-003 verified owner 49→50/50→51, global 9999→10000/10000→10001 boundaries, retry/collision classification, and atomic sessions-plus-bootstrap owner rekey.
88. Unsupported-method owner mutation:
    - Red: Worker `PATCH /api/sessions` returned 405 only after minting or migrating an anonymous owner.
    - Green: exact collection/item method dispatch runs before ID, provenance, body, owner, or D1 work; rejected methods return 405 without `Set-Cookie`.
89. Canonical document-size amplification:
    - Red: a valid compact 3,000-node document was below 256 KiB before normalization and above the storage cap after canonical serialization.
    - Green: the shared parser rechecks UTF-8 bytes after canonicalization and returns 413 before owner resolution in Worker and Pages.
90. Concurrent legacy-owner handoff:
    - Red: parallel requests with one legacy cookie could rekey to different owners, allowing the later response to strand migrated maps.
    - Green: a deterministic replacement plus a short-lived D1 handoff marker makes concurrent migration idempotent; tests also advance beyond expiry and prove the old bearer receives an empty owner.
91. Item identity invariants:
    - Red: unbounded/unsafe route IDs reached SQL, and PUT could store document B in session row A.
    - Green: one bounded route-safe ID validator runs before owner lookup, and PUT rejects a canonical document ID that differs from its route ID.
92. Atomic normal-create classification:
    - Red: retry/collision status was queried after the create batch and could observe a concurrent DELETE or PUT.
    - Green: the status SELECT is the fourth statement in the same D1 batch in Worker and Pages.
93. Final behavioral SQL verification:
    - Real SQLite with migrations 001-003 verified concurrent-idempotent owner handoff, expiry consumption, ownership-table rekey, and create status selection inside the transaction.

Additional regression coverage:

- Failed initial list performs zero POST requests.
- Owner bootstrap marker with a deleted session returns `id: null` and does not recreate, including an identical request retry.
- Auto-layout empty-node insertion plus unchanged content persistence is removed by one undo.
- A delayed startup load cannot replace an in-progress drag.
- Two concurrent bootstrap requests return one authoritative session.
- StrictMode still issues one client bootstrap request.
- Selection-only changes remain compatible with bootstrap.
- Same-document edits before and during save are persisted.

## Verification

- Focused changed-area tests:
  - `pnpm exec vitest run packages/core/tests/editor.test.ts packages/react/tests/useKeyboard.test.tsx demo/tests/App.test.tsx demo/tests/d1store.test.ts demo/tests/worker.test.ts demo/tests/pages-sessions.test.ts demo/tests/apiLimits.test.ts`
  - Passed: 7 files, 166 tests.
- Full CI:
  - `pnpm dlx node@22 /opt/homebrew/lib/node_modules/pnpm/bin/pnpm.cjs run ci`
  - Passed under Node 22.23.1: format, lint, typecheck (including tests/Functions), 30 test files, 402 tests, dependency boundaries.
- Coverage:
  - `pnpm test:coverage`
  - Passed: 89.69% lines overall; core 92.74%; react 83.99%.
- Demo build:
  - `pnpm --filter @mindmaplib/demo build`
  - Passed; bundle included `dist/assets/index-CdQR35WH.js`.
- Browser tests:
  - `pnpm test:browser`
  - Passed: 4 Playwright tests.
- Pages Functions routing:
  - `pnpm dlx wrangler@4 pages functions build demo/functions --project-directory demo ...`
  - Passed with Wrangler 4.110.0; generated exact route/method graph was GET/POST `/api/sessions` and GET/PUT/DELETE `/api/sessions/:id`.
- Whitespace:
  - `git diff --check` and `git diff --cached --check`: passed.
- Static security scan:
  - No hardcoded secret, shell injection, eval/exec, unsafe deserialization, or SQL string-format finding in added lines.
- Known existing warnings:
  - TipTap duplicate link extension warnings.
  - React test SVG path warning.
  - Vite chunk-size warning.

## Review History

- Multiple earlier Codex rounds identified and drove fixes for localStorage compatibility, stale create/load races, stale sidebar replacement, dirty-state rebasing, and missing changeset coverage.
- Final review attempt on 2026-07-10 found P2: `markSaved(version)` accepted an unrelated authoritative version. Fixed with a rejecting invariant and regression test.
- Independent pre-commit review on 2026-07-10 found:
  - stale existing-session load after await;
  - stale initial list/sidebar replacement;
  - list failure treated as empty;
  - localStorage marker owner mismatch and concurrent-tab duplication;
  - unsafe `markSaved(version)` optimistic-version behavior.
- All five findings were addressed with tests and the server-side owner bootstrap design.
- Post-fix Codex review then found two P2 issues: version-only guards missed direct drag mutation, and identical bootstrap retries could recreate a deleted sample. Both were reproduced with red tests and fixed using document identity and per-request bootstrap claims.
- The user-reported empty-node undo/origin regression was reproduced in the production UI and a focused React test; the structural/layout undo boundary and no-op content history were corrected.
- The next Codex and independent reviews found Pages Functions claim drift and a stale structural-layout merge marker across document load. Both were reproduced with red tests and fixed; both deployable handlers now share the same claim protocol, and layout merge state is explicit and cleared at history boundaries.
- The following Codex and independent reviews found measurement-only relayout cancellation, sidebar refresh unwinding successful persistence, and an explicit-create versus delayed-startup race. All three were reproduced with red App tests and fixed with transaction-aware startup snapshots, isolated refresh errors, and user-intent generation checks.
- The next reviews found one missing bootstrap intent recheck, an unhandled post-delete list failure, stale startup error reporting, and out-of-order explicit create completion. All four were reproduced with red App tests and fixed using response-time intent checks, local delete reconciliation plus handled refresh, stale error suppression, and per-operation intent generations.
- The following reviews found missing sidebar reconciliation for another tab's sample, unchecked DELETE status, stale import/rename/duplicate/autosave completions, replacement-load failure after delete, and silent bootstrap catch-up save failure. These were covered by new D1Store/App tests and fixed with checked delete responses, pre-save attachment, operation generations, guarded async actions, stale-save suppression, and blank-state delete reconciliation.
- The final candidate review found that action invalidation canceled queued debounced persistence. A red switch-before-debounce regression test reproduced the loss; per-editor timers now preserve persistence while stale UI effects remain suppressed.
- The next review found concurrent-save and same-document reopen races. Writes are now serialized per editor, bootstrap catch-up is the first queued task before attachment, and target-document loads flush queued/in-flight persistence first. A red load-save-load ordering test protects the reopen path.
- The release-gate independent review and two Codex reviews found failed background saves becoming unreachable, edits during GET being replaced, inactive row actions racing queued saves, orphan bootstrap markers after session-ID collision, and Refresh cancelling startup bootstrap. All findings were reproduced with red tests and corrected with per-document failed-save retention, load-interval transaction guards, inactive-action flushes, transactional orphan cleanup, and startup Refresh gating.
- The following release-gate reviews found that bootstrap catch-up failures lacked an authoritative retry, edits during the pre-load PUT could still be replaced, and migration 003 did not mark existing owners. All three were reproduced with red tests and fixed through a retained bootstrap retry closure, a pre-flush transaction snapshot, and one-marker-per-owner migration backfill.
- The next release-gate reviews found active TipTap replacement loss, async completion after App unmount, normal autosave bypassing the retained bootstrap task, and hidden server-created sessions after canceled loads. All four were reproduced with red tests and fixed through a shared document-replacement guard, lifecycle generation invalidation, retained-task-first dispatch, and unconditional post-mutation list reconciliation.
- The following gate found edits beginning after request start, stale successful mutations that escaped list reconciliation, missing normal-create owner markers, and stale list-error banners. They were reproduced with six red tests and corrected through source snapshots, local delete recovery, mounted intent-independent mutation reconciliation, atomic normal-create marker batches in both Cloudflare paths, and list-owned error tracking.
- The next gate found stale active-delete replacement selection, blank-before-load identity invalidation, and chained requests surviving unmount. Five red tests reproduced authoritative replacement, queued save, bootstrap loop, duplicate, and rename cases. The fixes return authoritative rows from reconciliation, load replacements before fallback, apply lifecycle generations to queued/bootstrap work, and gate D1Store follow-up mutations.
- The following gate found edits lost after canceled delete replacement, active detachment on transient load failure, late document-action baseline capture, superseded delete reconciliation, and active autosave UI suppression by inactive row actions. Five defects were RED; a sixth active-duplicate interval was already safe. Fixes introduced operation-source guards, 404-specific missing semantics, latest-list promise chaining, and per-editor save generations.
- The next independent gate found active rename could commit against a source edited during GET/PUT, duplicate could POST after its source changed, and Pages lacked the advanced Worker's document-response owner bootstrap. Four RED tests now cover rename continuation, mutation interaction locking, duplicate continuation, and one-cookie concurrent Pages list/create. Fixes add source-aware continuations, an inert workspace lock for rename/duplicate, and shared Pages owner middleware.
- The following Codex gate found active-delete local recovery could retain a post-delete autosave, and global undo/redo could bypass the inert interaction lock. Both were reproduced RED and fixed with detach-time per-editor save cancellation plus capture-phase shortcut consumption.
- The next independent/Codex gate found a superseded lock lifetime, Pages item-route gap, legacy-cookie migration/security conflict, unbounded anonymous writes, missing test typecheck, and save queues that were UI-invalidated without network tombstones. All were reproduced or validated, fixed, and covered by strict TypeScript, deterministic lifecycle tests, limits/migration tests, and a real Wrangler-generated route graph assertion.
- The subsequent Codex review found that the request limit still buffered chunked bodies without `Content-Length`. A streamed RED test proved full consumption; the parser now cancels at the byte cap.
- The next independent and Codex reviews found incomplete CSRF provenance checks, unowned interaction locks, stale DELETE UI mutations, advanced-Worker route aliases, noncanonical content preservation, and a tautological revision test. Each was reproduced or directly corrected with focused regressions; all final verification gates passed.
- The following gate found owner cookies could be minted on rejected writes, legacy bearers remained replayable, server documents/versions were not validated, normal create collisions were unstructured, same-ID reopen could survive DELETE, and New map could drop a pending lock. These paths now validate before owner lookup, one-time rekey owners, classify create outcomes, detach deleted IDs, and transfer lock ownership; Worker, Pages, App, and real SQLite evidence cover the fixes.
- One initial full-CI rerun hit the existing asynchronous NodeView focus test. The exact test passed three consecutive isolated runs, and the immediate complete rerun passed all 360 tests plus dependency boundaries.
- The last two Codex reviews and independent gate found unsupported methods mutating owners, canonical-size amplification, concurrent legacy handoff loss, route/body identity drift, and nontransactional create classification. Each finding was reproduced or transactionally demonstrated, then closed with shared validation, early dispatch, an expiring D1 handoff marker, route/body equality checks, and in-batch status selection.
- Review is closed at the agreed objective release gate: no further open-ended P2 search is required after the complete verification snapshot above.

## Changeset

- Added: yes.
- Package: `@mindmaplib/core`.
- Bump type: patch.
- Reason: additive `MindmapEditor.markSaved()` helper for marking the current revision clean after host-managed persistence.

## Release and CI

- GitHub workflow/run: pending after push.
- D1 migration: pending production application.
- Cloudflare deployment: pending.
- Production smoke: pending.

## Remaining Risks

- `owner_bootstraps` intentionally persists after sample deletion for the life of that anonymous owner.
- A concurrent tab that loses the bootstrap race loads the authoritative sample only while its local editor remains untouched; local edits are never overwritten by that response.
- Legacy owner cookies have a five-minute migration grace window so concurrent tabs can receive the same replacement cookie. After that window, replay of the old bearer cannot resolve migrated data; a client that discarded every migration response during the full window must start as a new anonymous owner.
