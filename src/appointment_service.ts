import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { notifyAppointmentChange, type AppointmentChange } from "./appointment_alert.js";
import { createInfraiSmsClient, InfraiError } from "./infrai_sms.js";

const appointmentChangeSchema = z.object({
  eventId: z.string().min(1),
  appointmentId: z.string().min(1),
  patientPhone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  clinicName: z.string().min(1).max(80),
  startsAt: z.string().datetime({ offset: true }),
  status: z.enum(["booked", "confirmed", "rescheduled", "cancelled", "checked_in"])
}).strict();

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");
const infrai = createInfraiSmsClient(apiKey);

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/appointment-events") {
    json(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const parsed = appointmentChangeSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      json(response, 400, { error: "invalid_appointment_event", issues: parsed.error.issues });
      return;
    }
    const result = await notifyAppointmentChange(infrai, parsed.data as AppointmentChange);
    json(response, result.decision === "sent" ? 202 : 200, result);
  } catch (error) {
    if (error instanceof SyntaxError) {
      json(response, 400, { error: "invalid_json" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      json(response, status, { error: error.code, detail: error.message });
      return;
    }
    json(response, 500, { error: "service_error" });
  }
});

const port = Number(process.env.PORT ?? "3000");
server.listen(port, () => console.log(`Appointment alert service listening on http://localhost:${port}`));
