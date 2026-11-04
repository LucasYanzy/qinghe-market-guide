# Repository consolidation · 2026-11-04

- Canonical repository: https://github.com/LucasYanzy/qinghe-market-guide
- Public interactive demo: https://lucasyanzy.github.io/qinghe-market-guide/
- Legacy source repository: `LucasYanzy/Rutgers-Community-Farmers-Market` (private archive for previous PR and review records).

The previous arrangement kept application source in the private repository and generated website files in the public repository. The public repository now contains the application source, its existing commits, and the earlier static website history. A Git merge joins the histories without rewriting or squashing the source commits. Generated files remain available in old commits; future builds are Pages artifacts instead of tracked files.

`main` is the only production branch. Open new issues and pull requests in the canonical repository. The website URL and `/markets`, `/orders`, `/retailer`, `/admin` and other direct route links keep the same prefix.

The imported application release includes the existing full customer, vendor and university workflows, English by default, the newest quantity and payment preference controls, and review before every preorder submission. Integration retains dynamic pickup slots, future pickup dates, fractional weights, SNAP eligibility checks and idempotent order submission. Demo changes remain isolated to each browser tab. Runtime databases, local environment files, backups, and unfinished local edits are excluded.

For local development, clone the canonical repository and run `npm ci` and `npm run dev`. Existing working directories with unfinished changes may remain in place; preserve those changes before switching remotes or branches. They are not automatically incorporated into the production build by this migration. The original local market directory’s source, tests, reference files and build configuration are additionally preserved under the tag `archive/local-market-workflows-2026-11-04`, including the newer vendor profile and school operations views. This snapshot excludes runtime data and generated review outputs and leaves the original working directory intact.

Original source branch tips are retained as `archive/source/2026-11-04/*` tags, listed with their commit IDs in [legacy-branches.json](legacy-branches.json). These tags also preserve branch-specific history that is not an ancestor of the integrated release.

Historical PR conversations remain in the private archive. Git commit ancestry is preserved here; GitHub PR numbers and discussions do not transfer between repositories.
