# Upstream-tracking fork

`main` is the integration line for the fork. The `upstream` remote points to
CarlesRojas/ha-diorama and `origin` to this fork. Keep merging upstream `main`;
do not freeze the project at a release and do not force-push shared history.
There is no automatic production deployment.

With pnpm available and a clean fork `main`, run `bash scripts/sync-upstream.sh`.
It fetches/prunes remotes, merges upstream, and runs tests, lint, build and the
local public-data gate. Resolve conflicts explicitly. The helper does not push.
Review the resulting diff before pushing. If upstream changes the review
anchors or storage contract, test and migrate private data separately.

## Contribution boundaries

The first two changes are deliberately separate from the larger workflows:

1. Numeric-history gaps and empty-value handling, with real-module tests.
2. Read-only interaction policy, including mid-drag revocation and generated
   tile inheritance, with service-boundary tests.
3. Local scan reference and alignment, including editor integration and
   external-resource refusal.
4. Anchored review threads, metadata storage and guided physical measurements.
5. Generic inspection, host observations, archive adapters and sensor-only
   opening visualization.

Items three through five currently form the fork's integrated workflow and
need extraction/design discussion before an upstream PR. Keep scene extension
points small. Test every extracted topic against current upstream, not merely
against the integrated fork. No upstream PR is created by these scripts.

Keep actual house geometry, models, room/family names, device bindings, host
addresses, feedback exports, recordings, photographs and secrets outside the
public repository. `.private/`, `.local-data/`, scan formats and common secret
files are ignored as an additional guard, not a substitute for inspection.
Do not republish manufacturer SVGs without their respective license rights.

Before pushing, explicitly stage only intended paths and run
`python3 scripts/check-public-data.py --base upstream/main`. It examines changed
text and asset paths locally, reports categories without matching values and
can also take `--forbidden-file` pointing to a private list of deployment terms.
This is a lightweight publication check, not a full secret scanner or security
audit. Review staged diffs and every outgoing commit as well. Never upload
private fixtures to a scanning service.
