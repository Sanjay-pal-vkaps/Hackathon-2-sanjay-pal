/**
 * Redaction utility for logs, errors, and telemetry (T-027)
 * Ensures no secret tokens, bot tokens, passwords, or raw auth headers leak into logs or telemetry.
 */

const SENSITIVE_KEY_PATTERN = /^(authorization|token|secret|password|bot_?token|api_?key|x-telegram-bot-api-secret-token|slack_?signing_?secret|cron_?secret)$/i;

export class SecretRedactor {
  /**
   * Redacts sensitive patterns in raw string outputs, URLs, error messages, and logs
   */
  static redactString(input: string): string {
    if (!input || typeof input !== "string") return input;

    return input
      // Redact Bearer tokens
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
      // Redact Telegram secret header values
      .replace(/(x-telegram-bot-api-secret-token\s*:\s*)[^\r\n,;]+/gi, "$1[REDACTED]")
      // Redact Slack bot tokens (xoxb-...)
      .replace(/xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,32}/g, "xoxb-[REDACTED]")
      // Redact URL query parameters
      .replace(/([?&](?:token|key|secret|password|api_?key)=)[^&\s]+/gi, "$1[REDACTED]")
      // Redact JSON/header style keys: "secret": "..." or "token": "..."
      .replace(/("?(?:token|secret|password|apiKey|botToken)"?\s*[:=]\s*)"[^"]+"/gi, '$1"[REDACTED]"');
  }

  /**
   * Recursively traverses objects to redact sensitive keys
   */
  static redactObject<T = any>(obj: T): T {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === "string") {
      return this.redactString(obj) as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactObject(item)) as unknown as T;
    }

    if (typeof obj === "object" && !(obj instanceof Date) && !(obj instanceof RegExp)) {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          result[key] = "[REDACTED]";
        } else {
          result[key] = this.redactObject(value);
        }
      }
      return result as unknown as T;
    }

    return obj;
  }
}
