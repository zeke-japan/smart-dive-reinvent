# Smart Dive architecture

![Architecture overview](architecture.svg)

This is a logical implementation diagram, not a network deployment boundary. G2 is a display/input accessory: the cockpit JavaScript executes in the Even phone app's WebView. Optional browser use shares the renderer and relay. The native helper is a separate iPhone app used for sign-in and handoff.

## Authentication and encrypted handoff

```mermaid
sequenceDiagram
    participant C as Even/Web cockpit
    participant I as iPhone Connect
    participant O as Events OAuth
    participant R as Relay Lambda
    participant D as DynamoDB
    C->>C: Generate slot and AES key
    C-->>I: User copies connection code
    I->>O: Authorize, PKCE and state
    O-->>I: Local callback authorization code
    I->>O: Exchange code with verifier
    O-->>I: Access token and expiry
    Note over I,R: Native also reads Events GetSchedule directly after sign-in
    I->>I: Encrypt token, expiry and relay URL
    I->>R: POST pair, ciphertext and bearer auth
    Note over R,D: Relay authenticates write with Events GetSchedule
    R->>D: Store slot and ciphertext, 120-second receive window
    C->>R: GET pair by slot
    R->>D: Read temporary ciphertext
    D-->>R: Ciphertext
    R-->>C: Ciphertext
    C->>C: Decrypt using original AES key
```

The key is not in the pair API payload. The relay does receive the bearer token for upstream authentication. A slot contains no pre-registered personal account. The connection code itself is not rewritten after authentication. DynamoDB TTL cleanup may occur after the code-enforced receive window.

## Session reads and explicit reservation

```mermaid
sequenceDiagram
    participant U as Attendee
    participant C as Cockpit
    participant R as Relay Lambda
    participant E as Events API
    participant D as DynamoDB
    C->>R: Read schedule/catalog, bearer token
    R->>E: Authenticated GET calls
    E-->>R: Session data
    R-->>C: Session data
    U->>C: Open Reserve
    C->>R: Prepare selected session
    R->>E: Read schedule and fresh session
    R->>D: Store short-lived confirmation ticket
    R-->>C: Confirmation, initially Cancel
    U->>C: Select Confirm explicitly
    C->>R: Confirm ticket
    R->>E: Revalidate schedule and session
    R->>D: Atomically claim operation
    R->>E: POST reservations for selected session
    R->>E: GET schedule to verify outcome
    R-->>C: Reserved, failed, or unknown
```

Preparation does not book a seat. HTTP 200 alone is insufficient to declare success. Unknown outcomes are not automatically resent. Deduplication is tied to the implementation's owner/session records, not a universal exactly-once claim.

## AI explanations

```mermaid
sequenceDiagram
    participant C as Cockpit
    participant R as Relay Lambda
    participant D as DynamoDB
    participant W as AI worker
    participant B as Bedrock Nova 2 Lite
    C->>R: Session ID, focus or 1-3 selected terms
    Note over R,W: Relay authenticates and fetches official session context
    R->>D: Claim owner-bound cached job
    R->>W: Async invoke with session context, no attendee token
    W->>B: Converse request
    B-->>W: Generated explanation
    W->>D: Store answer and job state
    C->>R: Poll job status
    R->>D: Check ownership and read result
    R-->>C: Labelled answer for paginated display
```

The cockpit normalizes common Markdown before paginating the shared Web/G2 display. Standard AI Dive is abstract-based. Keyword Dive adds general model knowledge to explain selected concepts together. Neither uses web search or retrieves unpublished lecture content. Only the normal user-confirmed reservation route writes reservations; the AI worker cannot book seats.

## Deployment and services

- CloudFront serves the guide/cockpit from an S3 bucket that blocks public access, using a scoped OAC bucket policy.
- API Gateway HTTP API invokes relay Lambda through method/path-scoped permissions.
- Relay and AI worker have separate roles. DynamoDB stores temporary pairing ciphertext, reservation state, and AI jobs/results.
- Bedrock uses Japan inference profile `jp.amazon.nova-2-lite-v1:0`; its allowed foundation-model regions are Tokyo and Osaka.
- Native OAuth goes directly to Events OAuth. Native sign-in also calls Events GetSchedule before the encrypted handoff. These calls do not go through CloudFront.
- AWS Events REST API reads and reservation writes go through relay for cockpit operation. MCP and AgentCore are not used.

Editable diagrams: Mermaid blocks above and `architecture.svg`. `architecture.png` is provided for article/video export. The diagrams use labelled service boxes rather than AWS trademark icon assets.
