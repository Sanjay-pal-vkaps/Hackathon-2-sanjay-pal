import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const baseUrl = process.env.APP_BASE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/auth/google/callback`;

  if (!clientId) {
    return NextResponse.json(
      { error: "Missing GOOGLE_CLIENT_ID in environment" },
      { status: 400 }
    );
  }

  const scopes = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.events.readonly",
  ].join(" ");

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=${encodeURIComponent(
    scopes
  )}&access_type=offline&prompt=consent`;

  return NextResponse.redirect(authUrl);
}
