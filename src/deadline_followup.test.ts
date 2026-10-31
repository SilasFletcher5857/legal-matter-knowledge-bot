import assert from "node:assert/strict";
import test from "node:test";
import { chooseFollowUp, signedDocumentSchema } from "./deadline_followup.js";

test("a signed matter due inside 72 hours gets urgent follow-up", () => {
  const document = signedDocumentSchema.parse({
    matter_id: "MAT-42",
    document_id: "DOC-7",
    title: "Executed settlement",
    text: "Payment is due on Friday.",
    delivery_status: "signed",
    signed_at: "2026-09-24T09:00:00.000Z",
  });
  const followUp = chooseFollowUp("2026-09-28T08:00:00.000Z", new Date("2026-09-25T09:00:00.000Z"));

  assert.equal(document.delivery_status, "signed");
  assert.equal(followUp, "urgent");
});

test("a later deadline stays on the scheduled queue", () => {
  const followUp = chooseFollowUp("2026-10-10T09:00:00.000Z", new Date("2026-09-25T09:00:00.000Z"));
  assert.equal(followUp, "scheduled");
});
