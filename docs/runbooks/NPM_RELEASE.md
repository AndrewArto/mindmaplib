# Initial npm release runbook

This runbook publishes the first public releases of `@mindmaplib/core` and `@mindmaplib/react` through the existing Changesets workflow.

## Expected release

Both packages must start at `0.1.0`:

- `@mindmaplib/core@0.1.0`
- `@mindmaplib/react@0.1.0`

The React package must declare `@mindmaplib/core` as `^0.1.0` in its packed peer dependencies.

## One-time npm prerequisites

1. Sign in to npm with the account that will own the packages.
2. Create the `mindmaplib` npm organization or user scope if it does not already exist.
3. Confirm that the publishing account is an owner of the `mindmaplib` scope.
4. Create a granular npm access token with read and write access to packages in that scope. Configure two-factor authentication according to npm policy.
5. Add the token to the GitHub repository:

```bash
gh secret set NPM -R AndrewArto/mindmaplib
```

Confirm that GitHub knows the secret name:

```bash
gh secret list -R AndrewArto/mindmaplib
```

Do not commit the token or place it in a local repository file.

## Pre-release verification

Run from the repository root with Node 22:

```bash
pnpm install --frozen-lockfile
pnpm run ci
pnpm build
pnpm changeset status
```

The Changesets status must predict `0.1.0` for both public packages.

Pack both packages without publishing:

```bash
rm -rf /tmp/mindmaplib-pack
mkdir -p /tmp/mindmaplib-pack
pnpm --filter @mindmaplib/core pack --pack-destination /tmp/mindmaplib-pack
pnpm --filter @mindmaplib/react pack --pack-destination /tmp/mindmaplib-pack
```

Inspect the tarballs and verify that each includes `LICENSE`, `README.md`, JavaScript, source maps, and type declarations. The React tarball must also include `dist/styles.css`.

Install the two tarballs into a clean React application and run its production build before merging the release PR.

## Publish through Changesets

1. Merge the publication-preparation PR into `main`.
2. Wait for the `Release` workflow to update the `Version Packages` PR.
3. Confirm that the release PR changes both package versions to `0.1.0` and changes the packed React peer dependency to `^0.1.0`.
4. Merge the `Version Packages` PR.
5. The next `Release` workflow run executes `pnpm changeset publish` and publishes both packages.

Never run `npm publish` or `pnpm publish` manually from a workstation.

## Post-release verification

```bash
npm view @mindmaplib/core@0.1.0 version dist.integrity repository
npm view @mindmaplib/react@0.1.0 version dist.integrity peerDependencies repository
```

Then verify installation from the registry in a new React project:

```bash
pnpm add @mindmaplib/core@0.1.0 @mindmaplib/react@0.1.0
```

Import both the component and its stylesheet:

```tsx
import { Mindmap } from '@mindmaplib/react'
import '@mindmaplib/react/styles.css'
```

Run the consumer project's typecheck and production build.

## After the first release

Configure npm Trusted Publishing for both packages using:

- GitHub organization or user: `AndrewArto`
- Repository: `mindmaplib`
- Workflow: `.github/workflows/release.yml`
- Environment: leave empty unless the workflow later adopts one

After Trusted Publishing is verified with a later release, remove the long-lived `NPM` secret and update the workflow to use only OIDC. Initial package creation still requires an authenticated publisher that owns the `mindmaplib` scope.
