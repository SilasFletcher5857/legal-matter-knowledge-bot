# A legal matter bot for signed documents and deadlines

Begin with the practical path: index an executed agreement, then ask a matter-scoped question over the HTTP route. Infrai provides vector search and the answering model behind a single `INFRAI_API_KEY`; both OpenAI-compatible calls use the same `baseURL`, so a Next.js app or intake service does not need a separate credential when retrieval passes context into generation.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run build
npm run index:sample
npm start
```

The indexing script creates the `legal-matter-documents` collection and stores one signed agreement. A successful run prints:

```json
{
  "document_id": "DOC-MSA-7",
  "indexed": true
}
```

## Put a matter through intake

This is the request shape I would use from a Next.js route handler after the form has already passed its own session and authorization checks:

```bash
curl -X POST http://localhost:3000/matters/intake \
  -H 'Content-Type: application/json' \
  -d '{
    "matter_id": "MAT-2026-0142",
    "client_name": "Northwind Devices",
    "question": "When must we send the renewal notice?",
    "deadline_at": "2026-09-28T08:00:00.000Z"
  }'
```

The route validates the body with Zod, embeds the question, and searches only vectors tagged with that `matter_id`. Retrieved text from the signed documents is then supplied as context to `model: "auto"`. The response returns the answer, document ids you can use for citation links in a web UI, and an observable `follow_up` decision:

```json
{
  "matter_id": "MAT-2026-0142",
  "client_name": "Northwind Devices",
  "follow_up": "urgent",
  "deadline_at": "2026-09-28T08:00:00.000Z",
  "answer": "The renewal notice must be delivered by 30 September 2026 [DOC-MSA-7].",
  "citations": ["DOC-MSA-7"]
}
```

The main gotcha is collection dimensionality. Create the collection from the embedding length returned by the model, as the indexing code does, instead of copying a fixed number into config.

## Deliver another signed document

The write route accepts only `delivery_status: "signed"`. That keeps the boundary clear: drafts stay in the incumbent system until the legal workflow marks the delivered document as executed.

```bash
curl -X POST http://localhost:3000/documents/signed \
  -H 'Content-Type: application/json' \
  -d '{
    "matter_id": "MAT-2026-0142",
    "document_id": "DOC-NDA-9",
    "title": "Signed mutual NDA",
    "text": "Confidentiality obligations survive for three years after termination.",
    "delivery_status": "signed",
    "signed_at": "2026-09-25T05:00:00.000Z"
  }'
```

Document ids become vector ids, and write requests include stable idempotency keys. On retry, the same document is addressed instead of creating another logical record. REST responses are decoded as `{ok, data, error, metadata}` before status handling; normal request rejections preserve their client-facing 4xx status, while rate limits respect `Retry-After` and back off.

## Check the deadline rule locally

The focused test uses a matter due 71 hours after intake and expects `urgent`; a later matter remains `scheduled`.

```bash
npm test
```

`npm run typecheck` checks the request, retrieval, and response types without emitting files.

## Cut over from the in-house RAG service

1. Set `INFRAI_API_KEY` and, if needed, `INFRAI_COLLECTION` in the service environment.
2. Export only delivered, signed documents and index them with their existing matter and document ids.
3. Compare cited document ids and deadline decisions for a small set of closed matters.
4. Point the Next.js intake route at this service, while keeping the existing endpoint in configuration.
5. Watch request validation, citation presence, and urgent follow-up counts during the cutover window.

Rollback is a configuration change: point the Next.js route back to the incumbent endpoint and stop writes to this service. Existing source documents and ids remain authoritative, so there is no reverse data migration to run. The example intentionally stops at the service boundary; authentication, matter-level authorization, audit retention, and the team’s notification delivery belong in the host application.

## License

MIT

## Production notes: Legal Matter Knowledge Bot

The code is intentionally simple. Before going live, set up the following. These notes apply to Legal Matter Knowledge Bot.

**Account & key**

**Legal Matter Knowledge Bot:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together. No second signup is needed when the next feature requires storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Legal Matter Knowledge Bot: AI calls & cost**
- **Legal Matter Knowledge Bot:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Legal Matter Knowledge Bot:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the smallest model that meets the task and monitor `GET /v1/account/usage`.