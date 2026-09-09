# CypherTube: GitHub OAuth Access Resolution

**Date:** 2026-09-08
**Context:** Resolving the organization OAuth App restriction that blocked third-party API writes to the `CipherTube` organization repositories.

---

## Problem

While attempting to push updated documentation (`README.md`, `ASSESSMENT.md`) to the repository via the GitHub REST API using a properly-scoped OAuth token (`repo`, `public_repo`), all write operations failed with **HTTP 403**:

> Although you appear to have the correct authorization credentials, the `CipherTube` organization has enabled OAuth App access restrictions, meaning that data access to third-parties is limited.

The token itself was valid and read operations (fetching file SHAs, listing commits) succeeded — the block was specific to **write operations on organization-owned repositories**.

## Root Cause

GitHub organizations can enable an **OAuth App access restriction policy**. When enabled, third-party OAuth applications (including the Base44 connector app) are denied data access to the organization's repositories by default, regardless of the scopes granted to an individual user's token.

## Resolution Steps

1. **Confirm the token and scopes were correct.** Verified via `get_connectors_info` that the GitHub connector was authorized with `repo` and `public_repo` scopes — ruling out a token/scope problem.

2. **Attempt the OAuth re-authorization flow.** The re-auth attempt short-circuited because a valid connection already existed — confirming the problem was organizational policy, not authentication.

3. **Identify the policy location.** The setting lives under:
   `https://github.com/organizations/CipherTube/settings/oauth_application_policy`
   (Organization → Settings → Third-party Access → OAuth application policy)

4. **Grant organizational access.** An organization **Owner** either approved the Base44 OAuth application specifically, or removed the OAuth app restriction on the policy page. This requires Owner role on the `CipherTube` organization.

5. **Retry the push.** After the policy change took effect, both files were pushed successfully to `main` via the GitHub Contents API (`PUT /repos/{owner}/{repo}/contents/{path}`):
   - `73765fd` — docs: update README.md with v1.5.0 architecture overview and assessment roadmap
   - `f0c4620` — docs: add ASSESSMENT.md with detailed architecture assessment and build priorities

## Verification

- Both commits confirmed on `main` at the top of the commit history.
- Remote `ASSESSMENT.md` byte-for-byte identical (sha256 match) to the planned local version.
- Remote `README.md` confirmed to contain the v1.5.0 header and the ASSESSMENT.md cross-link.

## Notes for the Future

- **Faster fallback:** A GitHub Personal Access Token (classic, `repo` scope) bypasses the organizational OAuth App restriction entirely and takes about a minute to generate at `https://github.com/settings/tokens`.
- **Least privilege:** Prefer approving the specific OAuth application over removing the restriction entirely.
- **Only Owners can change this setting.** If the Settings tab is not visible on the organization page, the current account lacks the Owner role.
- GitHub sometimes requires a password/2FA confirmation when saving the policy change — easy to miss, so confirm the banner updates before retrying.

---

*Document generated 2026-09-08 · CypherTube Autonomous Architecture Node*
