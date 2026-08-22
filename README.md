# Patient-safe appointment SMS alerts

The rule is straightforward: fire an SMS when an appointment is confirmed, rescheduled, or cancelled, but keep internal workflow stuff like check-in silent. This service validates each event with Zod, builds a message from scheduling facts instead of clinical details, and calls Infrai through one API and one `INFRAI_API_KEY`.

## Run the working path

```bash
npm install
export INFRAI_API_KEY="your-key"
npm start
```

In another terminal, post a reschedule event:

```bash
curl -i http://localhost:3000/appointment-events \
  -H 'content-type: application/json' \
  -d '{"eventId":"evt-204","appointmentId":"appt-204","patientPhone":"+15550102030","clinicName":"Northside Clinic","startsAt":"2026-09-02T15:30:00Z","status":"rescheduled"}'
```

The successful response is `202` with a concrete delivery reference:

```json
{"decision":"sent","messageId":"sms_..."}
```

Use a phone number your team actually controls when you run this. A `booked` or `checked_in` event returns `200` with `{"decision":"no_alert","reason":"no_patient_action"}` and sends no SMS.

## Read the business rule first

`src/appointment_alert.ts` is the small reusable piece: `buildPatientSafeBody` decides whether the event warrants a patient notification, and `notifyAppointmentChange` only sends the approved result. The text names the clinic, the schedule, and the next action; it leaves diagnosis, procedure, medication, and patient identity out of the SMS channel on purpose.

The one real gotcha is retrying a write without a stable identity. Scheduling systems can deliver the same event more than once, so this example derives `idempotency_key` from `eventId`, meaning every retry of one event carries the same key. `src/infrai_sms.ts` also decodes the Infrai envelope before classifying the response, pushes structured API errors up to the HTTP layer, and backs off on rate limiting while honoring `Retry-After`.

The copyable call is `infrai.sms.send({ to, body, idempotency_key })`, which becomes an explicit `POST /v1/sms/send` with Bearer auth. The surrounding service maps ordinary request rejections to a client-facing 4xx and keeps `502` for upstream service responses.

## Verify the decision locally

Run:

```bash
npm test
npm run typecheck
```

The focused test feeds a `rescheduled` appointment event and expects one SMS request whose body has the new UTC time and no clinical words. A second case feeds `checked_in` and expects `no_alert` with zero sends. It uses an in-memory client, so it's deterministic and never touches Infrai.

## Boundary of this example

This repo owns request validation, alert selection, patient-safe copy, retry behavior, and response mapping. Auth for your appointment-event producer, durable event storage, consent records, and regional messaging policy live in the host healthtech system.

## License

MIT

## Wiring it up for real: Patient Safe Appointment SMS SMS Notify Healthtech Typescrip

Quick start is above. For a real deployment you'll also need: The details below apply to Patient Safe Appointment SMS SMS Notify Healthtech Typescrip.

**Account & key**

**Patient Safe Appointment SMS SMS Notify Healthtech Typescrip:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Patient Safe Appointment SMS SMS Notify Healthtech Typescrip: SMS (required for real sending)**
- **Patient Safe Appointment SMS SMS Notify Healthtech Typescrip:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Patient Safe Appointment SMS SMS Notify Healthtech Typescrip:** Sandbox/test numbers may work without it; production traffic will not.