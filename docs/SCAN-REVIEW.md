# Scan-assisted review workflows

This fork follows upstream `main`. Its extra workflows are opt-in, use Home
Assistant's existing authentication, and do not require a separate public
service. Existing configurations keep their original interaction behavior.
No real home, scan, feedback, camera image, host address or credential is
included in the examples.

## A safe starting card

This complete example uses a synthetic room and sensor-only observation
bindings. Replace the example entities and asset paths privately. The optional
telemetry and archive paths need an existing same-origin data provider.
Without one the inspector reports unavailable data rather than inventing it.

```yaml
type: custom:diorama-card
read_only: true
aspect_ratio: "16:10"
aspect_ratio_mobile: "3:4"
rooms:
  - id: workshop
    name: Workshop
    points:
      - [0, 0]
      - [5, 0]
      - [5, 4]
      - [0, 4]
decorations:
  - id: observed-door
    kind: garage_door
    room: workshop
    position: [3, 3.8]
  - id: host
    kind: pc_tower
    room: workshop
    position: [1, 2]
  - id: wall
    kind: half_wall
    variant: full_height
    room: workshop
    position: [2.5, 0]
    params:
      width: 5
      height: 2.6
devices:
  - entity_id: sensor.example_door_opening
    room: workshop
    position: [3, 3.8]
    decorations: [observed-door]
    observation:
      min: 0
      max: 100
  - entity_id: sensor.example_host_cpu
    room: workshop
    position: [1, 2]
    decorations: [host]
review:
  id: workshop-review
  frame: workshop-metres-v1
  storage: workshop-review-store
inspections:
  sensor.example_door_opening:
    title: Observed opening, not endpoint confirmation
    entities: [sensor.example_distance, sensor.example_signal_quality]
  sensor.example_host_cpu:
    title: Host observations
    telemetry:
      url: /local/example-observations/host.json
      node: example-host
      max_age_seconds: 180
```

`read_only` gates 3D service calls, clicks, cover drags, and generated side
panel widgets. A widget cannot opt back into control when its parent is
read-only. A read-only click opens the fork's inspector, not Home Assistant's
native control dialog. The editor's local state trials still work. Comment
and measurement modes also force the scene into read-only interaction.
This is a user-interface policy, not HA server authorization. Other cards,
automations, users and services remain outside this card's control.

An `observation` binding takes a numeric `sensor.*` state and maps its explicit
range into the model's opening, optionally inverted. Missing, blank or
unavailable values have no observed level. This never creates a controllable
cover, learns endpoints, changes sensor calibration, or confirms a mechanical
limit. Hardware learning and actuation remain separate.

## Scaniverse as a private reference

Export a self-contained binary GLB from Scaniverse. In the card or the visual
editor's 3D preview, open **Scan reference** and choose the file. The browser
reads the file directly. Neither its bytes nor its filename are placed in
YAML, uploaded, or sent to an AI/model service. External GLB resources are
rejected before the loader runs. Compressed exports needing external decoder
resources are unsupported and report an error.

Align X/Y/Z translation, rotation around the vertical axis and scale explicitly.
Opacity lets the reference sit over the illustration while rooms and furniture
are edited. GLB uses Y up; plan coordinates are `[x, -z]`. Scale 1 means the
exporter's nominal metres, not independently verified dimensions. No image
reconstruction, automatic floorplan extraction or survey-accuracy claim is made.

**Remember on this browser only** is explicit opt-in IndexedDB persistence,
keyed by review ID and frame. It is not a shared HA upload or a backup. Shared
browsers share origin storage, so remove a reference before handing the browser
to someone else. **Remove local reference** deletes that card's cached scan.
Files are limited to 100 MiB and three million mesh vertices.

For scan tools without shared review storage, set `scan_reference` with a
stable `id` instead of `review`. Never put a private scan URL in a public
configuration or commit scans to this fork.

## Comments and physical measurements

An HA administrator explicitly initializes a new dedicated hidden storage
dashboard from the review toolbar. An existing dashboard is never replaced.
Use a unique hyphenated path that is not your normal dashboard. Initialization
and subsequent writes use supported `lovelace/*` websocket operations; no
`.storage` file is edited.

In **Comments**, click a surface. The text box and Save button appear beside
the selected point in 3D. A comment keeps its stable room/decoration identity,
object-local coordinates and original world position. Moving the object moves
its pin; missing objects retain the world position and show a warning. A scan
anchor also depends on the same local scan hash being loaded.

Threads preserve the original message and append replies with IDs, timestamps
and user/assistant/system author labels. Editing the original is separate.
Replies reopen solved threads. Solved pins are hidden normally and can be
shown and reopened in comment mode. Author labels describe the writer; they
are not cryptographic proof that a particular AI authored a message.

**Measure** proposes inside-polygon width/depth spans for each room. Click a
label and enter actual metres, using either decimal point or decimal comma.
Green labels and completion counts reflect saved physical values. The model
length remains separate, and entered values never rescale geometry. A changed
span is flagged for rechecking instead of reusing its previous measurement.
Explicit `review.dimensions` can define other stable spans.

Change `review.frame` deliberately when the coordinate system changes. Never
reassign an old dimension ID to a different physical span or silently migrate
anchors. Existing application-specific feedback is not automatically imported.
Keep its original private export and perform a reviewed frame/ID migration.

Writes compare fresh state, retain operation IDs after uncertain responses,
and verify exact readback. Replies merge into a freshly loaded thread and
never resurrect a deleted thread. Browser Web Locks serialize same-browser
writers. HA's Lovelace API does **not** provide cross-client atomic
compare-and-swap; independent simultaneous writers can still race. Use one
active writer during a review session and export before bulk operations.
The store is limited to 100 threads, 200 replies per thread and 1 MiB.

The CLI can read or append actual assistant replies without touching devices:
`node scripts/review.ts` accepts `--url`, `--id`, `--frame`, `--storage`,
optional `--operation` pointing to a private JSON operation, and optional
`--output` for a private full-document export. Supply `DIORAMA_HA_TOKEN` through
the environment, never command arguments or Git. HTTPS or an authenticated
loopback tunnel is required. Standard output contains counts only. Keep the
same operation file and reply ID when retrying an uncertain save.

## Inspections, host snapshots and camera history

`inspections` is keyed by entity ID. It can add up to eight related native HA
histories, a same-origin `logo`, an identity-checked host snapshot, or a camera
archive. Manufacturer artwork is not included; use only assets you have rights
to serve. A camera entity also uses HA's existing live image element.

Host snapshots use `formatVersion: 1`, `status`, `node`, `generatedAt`,
`observedAt`, `current` and `history`. Current values are CPU, memory and disk
percentages, temperature in Celsius and uptime seconds. History has at most
300 `[milliseconds, value-or-null]` points per percentage. Wrong identities,
stale observations, invalid values and source errors are visible errors, not
healthy zeroes. The browser never accesses Prometheus or exporter credentials.

An archive has a `formatVersion: 1` index containing `camera`, `status`,
`generatedAt`, `start`, `end`, `frames` and `coverage`. Frames are sorted
`[milliseconds, simple-jpeg-filename]` pairs. Coverage intervals distinguish
recording holes from missing thumbnails. Configure `index`, `base`, `camera`
and optionally `max_offset_seconds` under an inspection's `archive`.
The scrubber reports the actual capture time and offset, refuses uncovered
times, aborts superseded requests, and never labels an old frame as live.
Requests stay same-origin, and paths with embedded credentials or query tokens
are rejected. Derive and authorize the cache on your own backend.

## Synthetic workshop

Run `pnpm dev` and open `/src/dev/review.html`. All entities, persisted feedback,
telemetry and JPEGs on this page are generated synthetic data. It does not
connect to HA. The default background is dark. `pnpm test`, `pnpm lint` and
`pnpm build` exercise the fork without private assets.
