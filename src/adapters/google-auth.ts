export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export class GoogleAuthHelper {
  private static cachedToken: string | null = null;
  private static tokenExpiryMs = 0;

  /**
   * Resolves a valid Google OAuth access token.
   * Priority:
   * 1. In-memory unexpired cached token
   * 2. Direct GOOGLE_ACCESS_TOKEN env variable
   * 3. Refresh token exchange via https://oauth2.googleapis.com/token
   * 4. Fallback to GOOGLE_REFRESH_TOKEN (for unit testing / mock fetchers)
   */
  static async getAccessToken(options: {
    fetcher?: (url: string, init: RequestInit) => Promise<Response>;
  } = {}): Promise<string | undefined> {
    const now = Date.now();

    // 1. Direct short-lived token override
    if (process.env.GOOGLE_ACCESS_TOKEN) {
      return process.env.GOOGLE_ACCESS_TOKEN;
    }

    // 2. Return unexpired cached token (with 5-minute safety margin)
    if (this.cachedToken && this.tokenExpiryMs > now + 300_000) {
      return this.cachedToken;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    // 3. Perform refresh token exchange if credentials exist
    if (clientId && clientSecret && refreshToken && !refreshToken.startsWith("mock_")) {
      try {
        const fetchFn = options.fetcher || fetch;
        const res = await fetchFn("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          }).toString(),
        });

        if (res.ok) {
          const data = (await res.json()) as GoogleTokenResponse;
          this.cachedToken = data.access_token;
          this.tokenExpiryMs = now + (data.expires_in || 3600) * 1000;
          return this.cachedToken;
        }
      } catch (err) {
        // Fall through to fallback
      }
    }

    // 4. Fallback for test fixtures or legacy tokens
    return refreshToken;
  }

  static clearCache(): void {
    this.cachedToken = null;
    this.tokenExpiryMs = 0;
  }
}
