import type { InfraiSmsClient } from "./infrai_sms.js";

export type AppointmentChange = {
  eventId: string;
  appointmentId: string;
  patientPhone: string;
  clinicName: string;
  startsAt: string;
  status: "booked" | "confirmed" | "rescheduled" | "cancelled" | "checked_in";
};

export type AlertDecision =
  | { decision: "no_alert"; reason: "no_patient_action" }
  | { decision: "sent"; messageId: string };

const patientActionStatuses = new Set<AppointmentChange["status"]>([
  "confirmed",
  "rescheduled",
  "cancelled"
]);

export function buildPatientSafeBody(change: AppointmentChange): string | null {
  if (!patientActionStatuses.has(change.status)) return null;

  const when = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(change.startsAt));

  const action = change.status === "cancelled"
    ? `Your appointment on ${when} was cancelled.`
    : change.status === "rescheduled"
      ? `Your appointment was moved to ${when}.`
      : `Your appointment for ${when} is confirmed.`;

  return `${change.clinicName}: ${action} Call the clinic if this was unexpected. No reply needed.`;
}

export async function notifyAppointmentChange(
  infrai: InfraiSmsClient,
  change: AppointmentChange
): Promise<AlertDecision> {
  const body = buildPatientSafeBody(change);
  if (!body) return { decision: "no_alert", reason: "no_patient_action" };

  const result = await infrai.sms.send({
    to: change.patientPhone,
    body,
    idempotency_key: `appointment-event:${change.eventId}`
  });
  return { decision: "sent", messageId: result.message_id };
}
