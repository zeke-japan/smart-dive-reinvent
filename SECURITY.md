# Security considerations

Prototype; no independent security audit. Do not post credentials in public issues. Use an established private contact for sensitive findings until the repository owner configures a private reporting channel.

## Boundaries

- OAuth uses PKCE S256 and state. Access tokens remain in native/cockpit memory; refresh tokens are not persisted.
- A connection code contains a random slot ID and AES key: treat it as secret. The helper encrypts the handoff with AES-GCM. Pair payloads contain ciphertext and slot; the relay separately receives a bearer token to authenticate the write upstream.
- Pair reads are intentionally unauthenticated at high-entropy slots. Code enforces a 120-second receive window. DynamoDB TTL deletion can happen later, so this does not promise immediate physical deletion.
- The relay is public HTTPS. CORS is not authorization. IAM restricts Lambda access; attendee operations authenticate through the Events API.
- Token claims are decoded for early checks, not treated as a locally verified signature. New operations authenticate upstream; existing owner-bound AI result polling uses token-hash/expiry checks.
- Explicit confirmation precedes reservations; temporary tickets and operation records suppress repeats. Unknown outcomes do not auto-retry. This is bounded prototype behavior, not a universal exactly-once guarantee.
- AI receives session context, not credentials or the personal schedule. Model output remains untrusted display content.

## Public hosting and cost

S3 blocks public access and grants CloudFront scoped OAC reads. Gateway throttling and application pairing/AI rate gates are basic controls, not comprehensive abuse protection. Authenticated users can incur inference cost; public pair reads also consume resources. Configure budgets/monitoring before broader use. WAF and stronger per-user quotas are not implemented.

The reviewed templates have no administrator-wide IAM grants, embedded account credentials or anonymous S3-read policy. This is source review, not a live account/logging audit. Review data exposure before enabling request-body or authorization-header logging.

## Configuration and release

Official public OAuth client IDs, provider URLs, region/model IDs and intentionally public guide URLs are not secrets. The native relay default is blank; configure your own endpoint. Do not weaken production auth to accept dummy credentials.

`.gitignore` excludes local config, credentials, certificates, builds, dependencies, user state and personal exports. Ignore rules do not remove tracked or historical secrets. Review the index and every branch/tag before publishing an existing repository.
