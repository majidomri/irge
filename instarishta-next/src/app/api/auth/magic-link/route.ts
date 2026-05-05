import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Rate limiting: 1 request per email per 60s (in-memory, resets on cold start)
const lastSent = new Map<string, number>();
const RATE_MS = 60_000;

function rateCheck(email: string): boolean {
  const last = lastSent.get(email) ?? 0;
  if (Date.now() - last < RATE_MS) return false;
  lastSent.set(email, Date.now());
  return true;
}

function emailHtml(link: string, email: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f0eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.09);">

      <!-- Header -->
      <tr>
        <td style="background:#1E3932;padding:28px 36px 24px;">
          <p style="margin:0;font-size:22px;font-weight:800;color:#00C87A;letter-spacing:-0.5px;">InstaRishta</p>
          <p style="margin:5px 0 0;font-size:12px;color:rgba(255,255,255,0.45);font-weight:500;">Trusted Muslim Matrimony</p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:36px 36px 28px;">
          <p style="margin:0 0 6px;font-size:26px;font-weight:800;color:#141413;line-height:1.2;">Your sign-in link 💍</p>
          <p style="margin:0 0 28px;font-size:15px;color:#696969;line-height:1.7;">
            Click the button below to sign in to InstaRishta.<br>
            This link is valid for <strong style="color:#141413;">60 minutes</strong> and works only once.
          </p>

          <!-- CTA -->
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="border-radius:100px;background:#006241;">
                <a href="${link}" target="_blank"
                  style="display:inline-block;padding:15px 36px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:100px;letter-spacing:-0.2px;">
                  Sign in to InstaRishta →
                </a>
              </td>
            </tr>
          </table>

          <!-- Or copy link -->
          <p style="margin:24px 0 6px;font-size:12px;color:#A0A0A0;">Or copy this link into your browser:</p>
          <p style="margin:0;font-size:11px;color:#B0A8A0;word-break:break-all;background:#FAFAF9;padding:10px 14px;border-radius:8px;border:1px solid #F0ECE8;">
            ${link}
          </p>
        </td>
      </tr>

      <!-- Divider -->
      <tr><td style="padding:0 36px;"><hr style="border:none;border-top:1px solid #F0ECE8;margin:0;"></td></tr>

      <!-- Footer -->
      <tr>
        <td style="padding:20px 36px 28px;">
          <p style="margin:0 0 4px;font-size:12px;color:#B0A8A0;line-height:1.6;">
            This email was sent to <strong style="color:#696969;">${email}</strong> because a sign-in was requested.<br>
            If you didn't request this, you can safely ignore this email.
          </p>
          <p style="margin:14px 0 0;font-size:11px;color:#C0B8B0;">
            © 2025 InstaRishta ·
            <a href="https://instarishta.me" style="color:#006241;text-decoration:none;">instarishta.me</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export async function POST(request: NextRequest) {
  try {
    const { email, redirectTo } = await request.json() as { email?: string; redirectTo?: string };

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    if (!rateCheck(email)) {
      return NextResponse.json({ error: 'Please wait 60 seconds before requesting another link' }, { status: 429 });
    }

    const resendKey     = process.env.RESEND_API_KEY;
    const serviceKey    = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const siteUrl       = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
    const callbackUrl   = `${siteUrl}/auth/callback?next=${encodeURIComponent(redirectTo || '/')}`;

    // ── Path A: Resend + Admin (best — no Supabase email rate limits) ───────────
    if (resendKey && serviceKey) {
      const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data, error: genError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo: callbackUrl },
      });

      if (genError || !data?.properties?.action_link) {
        return NextResponse.json(
          { error: genError?.message ?? 'Failed to generate link' },
          { status: 500 }
        );
      }

      const resend = new Resend(resendKey);
      const fromAddress = process.env.RESEND_FROM ?? 'InstaRishta <onboarding@resend.dev>';

      const { error: mailError } = await resend.emails.send({
        from: fromAddress,
        to: email,
        subject: 'Your InstaRishta sign-in link',
        html: emailHtml(data.properties.action_link, email),
      });

      if (mailError) {
        return NextResponse.json({ error: 'Failed to send email. Please try again.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, via: 'resend' });
    }

    // ── Path B: Supabase built-in OTP (fallback when keys not configured) ──────
    const supabase = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl },
    });

    if (otpError) {
      return NextResponse.json({ error: otpError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, via: 'supabase' });

  } catch (err) {
    console.error('magic-link route error:', err);
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 });
  }
}
