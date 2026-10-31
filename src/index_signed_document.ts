import { signedDocumentSchema } from "./deadline_followup.js";
import { InfraiKnowledgeClient } from "./infrai_knowledge_client.js";

const document = signedDocumentSchema.parse({
  matter_id: "MAT-2026-0142",
  document_id: "DOC-MSA-7",
  title: "Signed master services agreement",
  text: "The renewal notice must be delivered by 30 September 2026. Notices go to the legal operations inbox.",
  delivery_status: "signed",
  signed_at: "2026-09-24T09:30:00.000Z",
});

const result = await new InfraiKnowledgeClient().indexSignedDocument(document);
console.log(JSON.stringify(result, null, 2));
