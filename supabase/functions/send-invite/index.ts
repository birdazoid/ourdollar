// Household invite email + push (Phase 6, push added Phase 8).
//
// Called by the app right after an inviter adds a member with an email. The
// recipient gets an email telling them who invited them and to which household,
// and to use THAT email address when they sign up — the invite then shows up
// in-app for them to accept or decline (see list_my_pending_invites). If the
// invited email already belongs to an OurDollar account with a registered
// device, we ALSO send them a push so an existing user hears about it right
// away instead of only by email.
//
// Security: the caller is identified from their JWT. The function only sends if
// (a) the named household_member row is a pending invite, and (b) the caller is
// actually a member of that household — so it can't be used to spam arbitrary
// addresses.
//
// Requires a Resend API key set as a function secret:
//   npx supabase secrets set RESEND_API_KEY=re_xxx
// Optional: INVITE_FROM (verified sender, e.g. "OurDollar <hello@yourdomain>")
//           and APP_URL (download link shown in the email).
//
// Deploy: npx supabase functions deploy send-invite
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FROM = Deno.env.get('INVITE_FROM') ?? 'OurDollar <onboarding@resend.dev>';
const APP_URL = Deno.env.get('APP_URL') ?? '';

function inviteHtml(opts: { inviter: string; household: string; email: string }) {
  const cta = APP_URL
    ? `<a href="${APP_URL}" style="display:inline-block;background:#5E8F77;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px">Get OurDollar</a>`
    : '';
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#F4F1DE;padding:32px 0">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:20px;padding:32px">
      <div style="font-size:24px;font-weight:800;color:#3D405B;margin-bottom:8px">OurDollar</div>
      <p style="font-size:16px;color:#3D405B;line-height:1.5">
        <strong>${opts.inviter}</strong> invited you to join the household
        <strong>“${opts.household}”</strong> on OurDollar — a simple way to share bills,
        savings goals, and weekly spending.
      </p>
      <p style="font-size:15px;color:#6B6E8C;line-height:1.5">
        To join, get the app and create an account using <strong>this email address</strong>
        (${opts.email}). Their invite will be waiting for you to accept when you open the app.
      </p>
      ${cta ? `<div style="margin:20px 0">${cta}</div>` : ''}
      <p style="font-size:13px;color:#6B6E8C;line-height:1.5">
        Didn't expect this? You can safely ignore this email — nothing was shared with you.
      </p>
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'missing token' }), { status: 401 });
    }

    const { memberId } = await req.json().catch(() => ({}));
    if (!memberId) {
      return new Response(JSON.stringify({ error: 'missing memberId' }), { status: 400 });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const { data: caller, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !caller.user) {
      return new Response(JSON.stringify({ error: 'invalid token' }), { status: 401 });
    }

    // The invite row.
    const { data: invite } = await admin
      .from('household_members')
      .select('household_id, invite_email, invite_pending')
      .eq('id', memberId)
      .maybeSingle();
    if (!invite || !invite.invite_pending || !invite.invite_email) {
      return new Response(JSON.stringify({ error: 'no pending invite' }), { status: 404 });
    }

    // The caller must belong to that household (anti-spam).
    const { data: callerMember } = await admin
      .from('household_members')
      .select('name')
      .eq('household_id', invite.household_id)
      .eq('account_id', caller.user.id)
      .maybeSingle();
    if (!callerMember) {
      return new Response(JSON.stringify({ error: 'not a member of this household' }), { status: 403 });
    }

    const { data: household } = await admin
      .from('households')
      .select('name')
      .eq('id', invite.household_id)
      .maybeSingle();

    const inviter = callerMember.name ?? 'Someone';
    const householdName = household?.name ?? 'their household';
    const to = invite.invite_email as string;

    // Best-effort push FIRST, so an existing account still gets pinged even if
    // email isn't configured yet or the email send fails — the two notifications
    // are independent.
    let pushed = 0;
    try {
      const { data: account } = await admin
        .from('accounts')
        .select('id')
        .ilike('email', to)
        .maybeSingle();
      if (account?.id) {
        const { data: tokens } = await admin
          .from('push_tokens')
          .select('expo_push_token')
          .eq('account_id', account.id);
        const pushTokens = (tokens ?? [])
          .map((t) => t.expo_push_token as string)
          .filter(Boolean);
        if (pushTokens.length > 0) {
          const messages = pushTokens.map((pushTo) => ({
            to: pushTo,
            title: 'OurDollar',
            body: `${inviter} invited you to join ${householdName}.`,
            sound: 'default',
          }));
          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(messages),
          });
          pushed = messages.length;
        }
      }
    } catch (pushErr) {
      console.error('invite push error (non-fatal)', pushErr);
    }

    // Email — sent to EVERY invitee (account or not), as an extra notification on
    // top of the push. A failure here no longer blocks the push above.
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'email not configured', pushed }), { status: 503 });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: `${inviter} invited you to ${householdName} on OurDollar`,
        html: inviteHtml({ inviter, household: householdName, email: to }),
        text: `${inviter} invited you to join "${householdName}" on OurDollar. Get the app and create an account with this email (${to}) to join.`,
      }),
    });

    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('resend error', result);
      return new Response(JSON.stringify({ error: 'send failed', detail: result, pushed }), { status: 502 });
    }

    return new Response(JSON.stringify({ sent: true, to, pushed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-invite error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
