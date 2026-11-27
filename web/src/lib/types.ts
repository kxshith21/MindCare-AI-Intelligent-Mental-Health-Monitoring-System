/** Shared view models inferred from the runtime API contracts. */
import type { z } from "zod";
import {
  checkinResponseSchema,
  clinicianNoteSchema,
  conversationSummarySchema,
  crisisResourceSchema,
  linkedPatientSchema,
  messageResponseSchema,
  psychologistSignupResponseSchema,
  riskEventSchema,
  trendPointSchema,
} from "@/lib/api/schemas";

export type CrisisResource = z.infer<typeof crisisResourceSchema>;
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
export type MessageResponse = z.infer<typeof messageResponseSchema>;
export type Checkin = z.infer<typeof checkinResponseSchema>;
export type LinkedPatient = z.infer<typeof linkedPatientSchema>;
export type TrendPoint = z.infer<typeof trendPointSchema>;
export type RiskEvent = z.infer<typeof riskEventSchema>;
export type ClinicianNote = z.infer<typeof clinicianNoteSchema>;
export type PsychologistSignupResponse = z.infer<
  typeof psychologistSignupResponseSchema
>;
