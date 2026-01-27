/**
 * Timeline Route Handler (308 Redirect)
 *
 * Redirects legacy /players/[playerId]/timeline to canonical
 * /players/[playerId]#timeline with HTTP 308 Permanent Redirect.
 *
 * @see PRD-022 WS2 Timeline Route Handler
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const { playerId } = await params;
  const url = new URL(`/players/${playerId}`, request.url);

  // Preserve query params from original request
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  url.hash = "timeline";
  return NextResponse.redirect(url, 308);
}
