import { NextResponse } from 'next/server';

import { sendWalkthroughRequestConfirmation } from '@/lib/email/send-walkthrough-request-confirmation';
import { sendWalkthroughRequestNotification } from '@/lib/email/send-walkthrough-request-notification';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid request body.' },
      { status: 400 },
    );
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).name !== 'string' ||
    typeof (body as Record<string, unknown>).email !== 'string'
  ) {
    return NextResponse.json(
      { ok: false, error: 'name and email are required.' },
      { status: 400 },
    );
  }

  const { name, email, phone, company, message } = body as {
    name: string;
    email: string;
    phone?: string;
    company?: string;
    message?: string;
  };

  if (!name.trim() || !email.trim()) {
    return NextResponse.json(
      { ok: false, error: 'name and email must not be empty.' },
      { status: 400 },
    );
  }

  await Promise.all([
    sendWalkthroughRequestNotification({
      name,
      email,
      phone,
      company,
      message,
    }),
    sendWalkthroughRequestConfirmation({ name, email }),
  ]);

  return NextResponse.json({ ok: true });
}
