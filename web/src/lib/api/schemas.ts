/**
 * Runtime contracts mirroring the Pydantic response models in /api.
 * Every FastAPI response is parsed with one of these before UI code sees it.
 *
 * UUID and datetime fields are validated as non-empty strings rather than
 * with format-specific helpers: this stays compatible across zod versions
 * while still rejecting missing/null/wrong-shape payloads.
 */
import { z } from "zod";

const id = z.string().min(1);
const timestamp = z.string().min(1);

export const apiErrorSchema = z.object({
  status: z.number().int(),
  code: z.string().min(1),
  message: z.string(),
});

export const healthSchema = z.object({
  status: z.string(),
  service: z.string(),
});

export const psychologistSignupResponseSchema = z.object({
  user_id: z.string().min(1),
  email: z.string().min(1),
  role: z.string().min(1),
  verified: z.boolean(),
});

export const crisisResourceSchema = z.object({
  name: z.string(),
  contact: z.string(),
  detail: z.string(),
  last_verified: z.string(),
});

export const riskLevelSchema = z.enum(["low", "elevated", "high"]);
export const emotionSchema = z.enum([
  "sadness",
  "anxiety",
  "anger",
  "fear",
  "joy",
  "neutral",
  "mixed",
]);

export const chatMessageResponseSchema = z.object({
  conversation_id: id,
  reply: z.string(),
  emotion: emotionSchema,
  themes: z.array(z.string()),
  risk_level: riskLevelSchema,
  show_crisis_resources: z.boolean(),
  crisis_resources: z.array(crisisResourceSchema),
});

export const conversationSummarySchema = z.object({
  id,
  created_at: timestamp,
});

export const conversationListResponseSchema = z.object({
  conversations: z.array(conversationSummarySchema),
});

export const messageResponseSchema = z.object({
  id,
  sender: z.enum(["user", "assistant"]),
  content: z.string(),
  created_at: timestamp,
  prompt_version: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
});

export const messageListResponseSchema = z.object({
  conversation_id: id,
  messages: z.array(messageResponseSchema),
});

export const checkinResponseSchema = z.object({
  id,
  patient_id: id,
  mood: z.number().int(),
  note: z.string().nullable().optional(),
  phq9_score: z.number().int().nullable().optional(),
  gad7_score: z.number().int().nullable().optional(),
  phq9_answers: z.array(z.number().int()).nullable().optional(),
  gad7_answers: z.array(z.number().int()).nullable().optional(),
  created_at: timestamp,
  show_crisis_resources: z.boolean().optional(),
  crisis_resources: z.array(crisisResourceSchema).optional(),
  reason: z.enum(["self_harm_ideation"]).nullable().optional(),
});

export const checkinListResponseSchema = z.object({
  checkins: z.array(checkinResponseSchema),
});

export const linkedPatientSchema = z.object({
  id,
  display_name: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  share_scope: z.enum(["summary_only", "full"]),
  last_checkin_at: timestamp.nullable().optional(),
});

export const patientListResponseSchema = z.object({
  patients: z.array(linkedPatientSchema),
});

export const trendPointSchema = z.object({
  mood: z.number().int(),
  phq9_score: z.number().int().nullable().optional(),
  gad7_score: z.number().int().nullable().optional(),
  created_at: timestamp,
  note: z.string().nullable().optional(),
  phq9_answers: z.array(z.number().int()).nullable().optional(),
  gad7_answers: z.array(z.number().int()).nullable().optional(),
});

export const trendsResponseSchema = z.object({
  patient_id: id,
  share_scope: z.enum(["summary_only", "full"]),
  checkins: z.array(trendPointSchema),
});

export const riskEventSchema = z.object({
  id,
  patient_id: id,
  message_id: id.nullable().optional(),
  level: riskLevelSchema,
  reason: z.string(),
  status: z.enum(["new", "acknowledged", "resolved"]),
  created_at: timestamp,
  reviewed_by: id.nullable().optional(),
  reviewed_at: timestamp.nullable().optional(),
  content: z.string().nullable().optional(),
});

export const riskEventListResponseSchema = z.object({
  events: z.array(riskEventSchema),
});

export const clinicianNoteSchema = z.object({
  id,
  patient_id: id,
  psychologist_id: id,
  note: z.string(),
  created_at: timestamp,
});

export const clinicianNoteListResponseSchema = z.object({
  notes: z.array(clinicianNoteSchema),
});

export const deleteAccountResponseSchema = z.object({
  status: z.string(),
  data_deleted: z.record(z.string(), z.unknown()),
  auth_user_deleted: z.boolean(),
});
