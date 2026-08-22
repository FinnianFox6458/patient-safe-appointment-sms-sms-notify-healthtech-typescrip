import assert from "node:assert/strict";
import test from "node:test";
import { notifyAppointmentChange, type AppointmentChange } from "../src/appointment_alert.js";
import type { InfraiSmsClient, SmsSendInput } from "../src/infrai_sms.js";

const baseChange: AppointmentChange = {
  eventId: "evt-lesson-204",
  appointmentId: "appt-204",
  patientPhone: "+15550102030",
  clinicName: "Northside Clinic",
  startsAt: "2026-09-02T15:30:00Z",
  status: "rescheduled"
};

test("rescheduled appointments send an action-focused alert without clinical details", async () => {
  const calls: SmsSendInput[] = [];
  const client = {
    sms: {
      send: async (input: SmsSendInput) => {
        calls.push(input);
        return { message_id: "sms_test_204" };
      }
    }
  } as InfraiSmsClient;

  const result = await notifyAppointmentChange(client, baseChange);

  assert.deepEqual(result, { decision: "sent", messageId: "sms_test_204" });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    to: "+15550102030",
    body: "Northside Clinic: Your appointment was moved to Sep 2, 2026, 3:30 PM. Call the clinic if this was unexpected. No reply needed.",
    idempotency_key: "appointment-event:evt-lesson-204"
  });
  assert.doesNotMatch(calls[0]!.body, /diagnosis|procedure|medication/i);
});

test("check-in events stay operational and do not send another patient alert", async () => {
  let sends = 0;
  const client = {
    sms: {
      send: async () => {
        sends += 1;
        return { message_id: "unexpected" };
      }
    }
  } as InfraiSmsClient;

  const result = await notifyAppointmentChange(client, { ...baseChange, status: "checked_in" });

  assert.deepEqual(result, { decision: "no_alert", reason: "no_patient_action" });
  assert.equal(sends, 0);
});
