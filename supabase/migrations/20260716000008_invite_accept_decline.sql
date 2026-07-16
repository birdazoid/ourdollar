-- OurDollar — Phase 8 (explicit invite accept / decline).
--
-- Phase 3 auto-linked invites on login (claim_pending_invites). We now let the
-- invited person SEE a pending invite in-app and explicitly Accept or Decline
-- it — including already-registered users who were invited to a second
-- household. Same trust model as before: an invited person isn't yet a member
-- of the target household, so RLS hides the placeholder household_members row
-- from them. These SECURITY DEFINER functions read/act on invites matched to the
-- caller's own verified email (auth.users.email), which the caller can't forge.

-- Provenance so the prompt can say WHO invited you and WHEN. Both nullable and
-- only set for invited rows; existing rows/fun-money-only members stay null.
alter table public.household_members
  add column if not exists invited_by_member_id uuid
    references public.household_members (id) on delete set null,
  add column if not exists invited_at timestamptz;

-- Invites addressed to the caller's email that haven't been claimed yet.
-- Returned to the client to render the accept/decline prompt.
create or replace function public.list_my_pending_invites()
returns table (
  member_id uuid,
  household_id uuid,
  household_name text,
  inviter_name text,
  invited_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select hm.id,
         hm.household_id,
         h.name,
         coalesce(inviter.name, 'Someone'),
         hm.invited_at
  from public.household_members hm
  join public.households h on h.id = hm.household_id
  left join public.household_members inviter on inviter.id = hm.invited_by_member_id
  where hm.account_id is null
    and hm.invite_pending = true
    and hm.invite_email is not null
    and lower(trim(hm.invite_email)) = (
      select lower(trim(email)) from auth.users where id = auth.uid()
    );
$$;

-- Accept one invite: link that placeholder row to the caller's account. The
-- email match is re-checked server-side, so a caller can only accept an invite
-- that was actually addressed to them. Returns true iff a row was linked.
create or replace function public.accept_invite(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_updated integer;
begin
  select lower(trim(email)) into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return false;
  end if;

  update public.household_members hm
     set account_id     = auth.uid(),
         has_account    = true,
         invite_pending = false
   where hm.id = p_member_id
     and hm.account_id is null
     and hm.invite_email is not null
     and lower(trim(hm.invite_email)) = v_email;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- Decline one invite: delete the placeholder member row (and its cascaded
-- fun-money allotment). Same email guard. Returns true iff a row was removed.
create or replace function public.decline_invite(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_deleted integer;
begin
  select lower(trim(email)) into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return false;
  end if;

  delete from public.household_members hm
   where hm.id = p_member_id
     and hm.account_id is null
     and hm.invite_pending = true
     and hm.invite_email is not null
     and lower(trim(hm.invite_email)) = v_email;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

grant execute on function public.list_my_pending_invites() to authenticated;
grant execute on function public.accept_invite(uuid) to authenticated;
grant execute on function public.decline_invite(uuid) to authenticated;
