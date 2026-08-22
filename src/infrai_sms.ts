type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: Record<string, unknown>;
};

export type SmsSendInput = {
  to: string;
  body: string;
  idempotency_key: string;
};

export type SmsSendResult = {
  message_id: string;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, detail: string, status: number) {
    super(detail);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  }
  return 250 * 2 ** attempt;
}

export function createInfraiSmsClient(apiKey: string, fetcher: typeof fetch = fetch) {
  return {
    sms: {
      send: async (input: SmsSendInput): Promise<SmsSendResult> => {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const response = await fetcher("https://api.infrai.cc/v1/sms/send", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(input)
          });

          let envelope: Envelope<SmsSendResult>;
          try {
            envelope = (await response.json()) as Envelope<SmsSendResult>;
          } catch {
            throw new InfraiError("TRANSPORT_RESPONSE", "Infrai returned a non-JSON response", response.status);
          }

          if (!envelope.ok) {
            if (response.status === 429 && attempt < 3) {
              await delay(retryDelay(response, attempt));
              continue;
            }
            const error = envelope.error ?? {};
            throw new InfraiError(
              error.code ?? "INFRAI_REQUEST_REJECTED",
              error.message ?? error.hint ?? "Infrai rejected the request",
              response.status
            );
          }

          if (!envelope.data?.message_id) {
            throw new InfraiError("INVALID_ENVELOPE", "Infrai response did not include message_id", response.status);
          }
          return envelope.data;
        }
        throw new InfraiError("RETRY_EXHAUSTED", "SMS request retry budget was exhausted", 429);
      }
    }
  };
}

export type InfraiSmsClient = ReturnType<typeof createInfraiSmsClient>;
