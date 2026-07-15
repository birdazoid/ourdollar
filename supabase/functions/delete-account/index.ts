// In-app account deletion (Phase 6 — App Store requires a real in-app delete,
// not a support-email request).
//
// The app can't delete an auth user itself (that needs the service role), so
// the client calls this function. It identifies the caller from their verified
// JWT — never from the request body — so a user can only ever delete their own
// account. Deleting the auth user cascades via FKs:
//   - accounts row (accounts.id → auth.users on delete cascade)
//   - households they OWN + all that household's data (bills, income, goals,
//     transactions, members, fun money, activity — all on delete cascade)
//   - their push tokens
//   - membership in households they don't own is unlinked (account_id → null),
//     leaving that household intact for its other members.
//
// Deploy: npx supabase functions deploy delete-account
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'missing token' }), { status: 401 });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    // Verify the caller and take their id from the token, not the request body.
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'invalid token' }), { status: 401 });
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(userData.user.id);
    if (delErr) {
      console.error('delete-account failed', delErr);
      return new Response(JSON.stringify({ error: delErr.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ deleted: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('delete-account error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
