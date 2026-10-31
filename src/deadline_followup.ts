import { z } from "zod";

export const matterIntakeSchema = z.object({
  matter_id: z.string().min(1),
  client_name: z.string().min(1),
  question: z.string().min(3),
  deadline_at: z.string().datetime(),
});

export const signedDocumentSchema = z.object({
  matter_id: z.string().min(1),
  document_id: z.string().min(1),
  title: z.string().min(1),
  text: z.string().min(1),
  delivery_status: z.literal("signed"),
  signed_at: z.string().datetime(),
});

export type MatterIntake = z.infer<typeof matterIntakeSchema>;
export type SignedDocument = z.infer<typeof signedDocumentSchema>;
export type FollowUp = "urgent" | "scheduled";

export function chooseFollowUp(deadlineAt: string, now: Date): FollowUp {
  const hoursRemaining = (new Date(deadlineAt).getTime() - now.getTime()) / 3_600_000;
  return hoursRemaining <= 72 ? "urgent" : "scheduled";
}
