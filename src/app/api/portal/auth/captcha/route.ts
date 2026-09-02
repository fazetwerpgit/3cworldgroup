import { NextResponse } from 'next/server';

interface RecaptchaVerifyResponse {
  success?: unknown;
  score?: unknown;
  action?: unknown;
}

let warnedUnconfigured = false;

export async function POST(request: Request) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    if (!warnedUnconfigured) {
      console.warn('reCAPTCHA is unconfigured; portal signup captcha is disabled.');
      warnedUnconfigured = true;
    }
    return NextResponse.json({ ok: true, unconfigured: true });
  }

  try {
    const body = await request.json() as { token?: unknown };
    const token = typeof body.token === 'string' ? body.token : '';
    const params = new URLSearchParams({ secret, response: token });
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await response.json() as RecaptchaVerifyResponse;
    const ok = data.success === true
      && (data.score === undefined || (typeof data.score === 'number' && data.score >= 0.5))
      && (data.action === undefined || data.action === 'signup');

    return NextResponse.json({ ok });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
