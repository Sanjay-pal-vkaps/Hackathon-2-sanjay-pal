import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { GoogleAuthHelper } from "@/adapters/google-auth";

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const error = req.nextUrl.searchParams.get("error");

    if (error) {
      return new NextResponse(
        `<html><body style="font-family: sans-serif; padding: 2rem; background: #0f172a; color: #f87171;">
          <h2>❌ Google Authentication Failed</h2>
          <p>${error}</p>
          <a href="/" style="color: #60a5fa;">Back to Dashboard</a>
        </body></html>`,
        { status: 400, headers: { "Content-Type": "text/html" } }
      );
    }

    if (!code) {
      return new NextResponse(
        `<html><body style="font-family: sans-serif; padding: 2rem; background: #0f172a; color: #f87171;">
          <h2>❌ Missing authorization code from Google</h2>
          <a href="/" style="color: #60a5fa;">Back to Dashboard</a>
        </body></html>`,
        { status: 400, headers: { "Content-Type": "text/html" } }
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const baseUrl = process.env.APP_BASE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/auth/google/callback`;

    // 1. Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId || "",
        client_secret: clientSecret || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return new NextResponse(
        `<html><body style="font-family: sans-serif; padding: 2rem; background: #0f172a; color: #f87171;">
          <h2>❌ Token Exchange Failed</h2>
          <pre>${errText}</pre>
          <a href="/" style="color: #60a5fa;">Back to Dashboard</a>
        </body></html>`,
        { status: 400, headers: { "Content-Type": "text/html" } }
      );
    }

    const tokenData = await tokenRes.json();
    const refreshToken = tokenData.refresh_token;
    const accessToken = tokenData.access_token;

    // 2. Persist token to environment and .env.local
    if (refreshToken) {
      process.env.GOOGLE_REFRESH_TOKEN = refreshToken;
      GoogleAuthHelper.clearCache();

      const updateEnvFile = (filename: string) => {
        try {
          const envPath = path.resolve(process.cwd(), filename);
          if (fs.existsSync(envPath)) {
            let content = fs.readFileSync(envPath, "utf-8");
            if (content.includes("GOOGLE_REFRESH_TOKEN=")) {
              content = content.replace(/GOOGLE_REFRESH_TOKEN=.*/g, `GOOGLE_REFRESH_TOKEN=${refreshToken}`);
            } else {
              content += `\nGOOGLE_REFRESH_TOKEN=${refreshToken}\n`;
            }
            fs.writeFileSync(envPath, content, "utf-8");
          }
        } catch (e) {
          // ignore
        }
      };

      updateEnvFile(".env.local");
      updateEnvFile(".env");
    } else if (accessToken) {
      // If no refresh token returned (e.g. prompt wasn't consent), use access token
      process.env.GOOGLE_ACCESS_TOKEN = accessToken;
      GoogleAuthHelper.clearCache();
    }

    return new NextResponse(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>Google Connected</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: radial-gradient(ellipse at top, #1E1B4B 0%, #0F172A 100%); color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <div style="background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(255, 255, 255, 0.1); padding: 2.5rem; border-radius: 16px; max-width: 480px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); backdrop-filter: blur(8px);">
            <div style="font-size: 3.5rem; margin-bottom: 1rem;">✅</div>
            <h1 style="font-size: 1.5rem; font-weight: 700; margin: 0 0 0.5rem; color: #34D399;">
              Google Connected Successfully!
            </h1>
            <p style="color: #94A3B8; font-size: 0.95rem; line-height: 1.5; margin: 0 0 1.5rem;">
              Gmail & Google Calendar read-only permissions are active. Your refresh token was dynamically generated and saved to <code>.env.local</code>.
            </p>
            <a href="/" style="display: inline-block; background: #6366F1; color: white; padding: 0.75rem 1.75rem; border-radius: 8px; text-decoration: none; font-weight: 600; transition: background 0.2s;">
              Return to Dashboard &rarr;
            </a>
          </div>
        </body>
      </html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err: any) {
    return new NextResponse(
      `<html><body style="font-family: sans-serif; padding: 2rem; background: #0f172a; color: #f87171;">
        <h2>❌ Server Error during OAuth Callback</h2>
        <p>${err.message}</p>
        <a href="/" style="color: #60a5fa;">Back to Dashboard</a>
      </body></html>`,
      { status: 500, headers: { "Content-Type": "text/html" } }
    );
  }
}
