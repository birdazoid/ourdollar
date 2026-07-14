-- OurDollar — Phase 3 (multi-household & invite claim).
--
-- Household *creation* is done client-side with plain inserts: existing RLS
-- (households_insert with owner = auth.uid(), then owns_household() for the
-- first member + settings rows) already lets an owner bootstrap a household.
--
-- Claiming an *invite*, however, needs elevated privilege. An invited person
-- who just signed up is not yet a member of the target household, so RLS blocks
-- them from reading or updating the placeholder household_members row the
-- inviter created. This SECURITY DEFINER function matches pending invites by
-- email and links them to the caller's account, atomically.

create or replace function public.claim_pending_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_count integer;
begin
  -- Source of truth for the caller's verified email is auth.users.
  select lower(trim(email)) into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return 0;
  end if;

  with claimed as (
    update public.household_members hm
       set account_id    = auth.uid(),
           has_account   = true,
           invite_pending = false
     where hm.account_id is null
       and hm.invite_email is not null
       and lower(trim(hm.invite_email)) = v_email
    returning hm.id
  )
  select count(*) into v_count from claimed;

  return coalesce(v_count, 0);
end;
$$;

-- Any authenticated user may claim invites addressed to their own email.
grant execute on function public.claim_pending_invites() to authenticated;
