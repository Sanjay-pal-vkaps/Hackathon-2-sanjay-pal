import crypto from "crypto";

export interface TelegramWebhookAuthOptions {
  secretTokenHeader?: string | null;
  expectedSecretToken?: string;
  senderChatId?: string | number | null;
  senderUserId?: string | number | null;
  allowedChatId?: string;
  allowedUserIds?: string[]; // comma-separated or array
}

export interface SecurityAuthResult {
  authorized: boolean;
  statusCode: number;
  reason?: string;
}

/**
 * Validates Telegram Webhook Secret Token and Chat/User Allowlists
 * Enforces X-Telegram-Bot-Api-Secret-Token and TELEGRAM_CHAT_ID / TELEGRAM_ALLOWED_USER_IDS
 */
export function verifyTelegramWebhook(options: TelegramWebhookAuthOptions): SecurityAuthResult {
  const {
    secretTokenHeader,
    expectedSecretToken,
    senderChatId,
    senderUserId,
    allowedChatId,
    allowedUserIds = [],
  } = options;

  // 1. Secret Token Verification (Timing-safe comparison)
  if (!secretTokenHeader || !expectedSecretToken) {
    return { authorized: false, statusCode: 401, reason: "Missing secret token header or server configuration" };
  }

  const tokenBuffer = Buffer.from(secretTokenHeader);
  const expectedBuffer = Buffer.from(expectedSecretToken);

  if (tokenBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
    return { authorized: false, statusCode: 401, reason: "Invalid secret token" };
  }

  // 2. Chat ID Allowlist Verification
  if (allowedChatId && senderChatId !== undefined && senderChatId !== null) {
    if (String(senderChatId) !== String(allowedChatId)) {
      return { authorized: false, statusCode: 403, reason: "Unauthorized Telegram chat ID" };
    }
  }

  // 3. User ID Allowlist Verification
  if (allowedUserIds.length > 0 && senderUserId !== undefined && senderUserId !== null) {
    const isUserAllowed = allowedUserIds.map((id) => String(id).trim()).includes(String(senderUserId));
    if (!isUserAllowed) {
      return { authorized: false, statusCode: 403, reason: "Unauthorized Telegram user ID" };
    }
  }

  return { authorized: true, statusCode: 200 };
}

export interface SlackSignatureVerificationOptions {
  signatureHeader?: string | null;
  timestampHeader?: string | null;
  rawBody: string;
  signingSecret?: string;
  maxAgeSeconds?: number;
}

/**
 * Validates Slack HMAC-SHA256 signature with replay attack protection
 */
export function verifySlackSignature(options: SlackSignatureVerificationOptions): SecurityAuthResult {
  const {
    signatureHeader,
    timestampHeader,
    rawBody,
    signingSecret,
    maxAgeSeconds = 300, // 5 minutes default
  } = options;

  if (!signatureHeader || !timestampHeader || !signingSecret) {
    return { authorized: false, statusCode: 401, reason: "Missing Slack signature, timestamp, or signing secret" };
  }

  const timestamp = parseInt(timestampHeader, 10);
  if (isNaN(timestamp)) {
    return { authorized: false, statusCode: 401, reason: "Invalid Slack timestamp format" };
  }

  const currentEpoch = Math.floor(Date.now() / 1000);
  if (Math.abs(currentEpoch - timestamp) > maxAgeSeconds) {
    return { authorized: false, statusCode: 401, reason: "Slack request timestamp expired (replay protection)" };
  }

  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac("sha256", signingSecret);
  const calculatedSignature = `v0=${hmac.update(sigBasestring).digest("hex")}`;

  const sigBuffer = Buffer.from(signatureHeader);
  const calcBuffer = Buffer.from(calculatedSignature);

  if (sigBuffer.length !== calcBuffer.length || !crypto.timingSafeEqual(sigBuffer, calcBuffer)) {
    return { authorized: false, statusCode: 401, reason: "Slack signature mismatch" };
  }

  return { authorized: true, statusCode: 200 };
}

export interface CronAuthOptions {
  authorizationHeader?: string | null;
  expectedCronSecret?: string;
}

/**
 * Validates Cron secret authorization header (Authorization: Bearer <CRON_SECRET>)
 */
export function verifyCronSecret(options: CronAuthOptions): SecurityAuthResult {
  const { authorizationHeader, expectedCronSecret } = options;

  if (!authorizationHeader || !expectedCronSecret) {
    return { authorized: false, statusCode: 401, reason: "Missing Authorization header or cron secret" };
  }

  const parts = authorizationHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return { authorized: false, statusCode: 401, reason: "Malformed Authorization header; expected Bearer token" };
  }

  const token = parts[1];
  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expectedCronSecret);

  if (tokenBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
    return { authorized: false, statusCode: 401, reason: "Invalid Cron secret token" };
  }

  return { authorized: true, statusCode: 200 };
}
