-- OurDollar — household roles & member-management permissions.
--
-- Roles: OWNER = households.owner_account_id (exactly one, the creator).
--        ADMIN = household_members.is_admin (granted by the owner = "sharing
--                ownership"). MEMBER = everyone else.
-- Rules (confirmed with Adrian):
--   • Owner + admins can add/approve/remove members and edit the household.
--   • A regular member CAN add people, but each add is held for owner/admin
--     approval (approval_pending) and no invite email goes out until approved.
--   • Only the OWNER grants/revokes admin and transfers ownership.
--   • The owner can't be removed; transferring ownership makes the old owner an
--     admin.
-- Security: sensitive columns (is_admin, approval_pending, account_id, owner)
-- are not directly updatable by clients — only via the SECURITY DEFINER RPCs
-- below, each of which re-checks the caller's role. Benign fields stay editable.

alter table public.household_members
  add column if not exists approval_pending boolean not null default false,
  add column if not exists added_by_member_id uuid references public.household_members (id) on delete set null;

-- Is auth.uid() an admin of this household? SECURITY DEFINER to avoid RLS
-- recursion on household_members (same pattern as is_household_member).
create or replace function public.is_household_admin(hid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from household_members hm
    where hm.household_id = hid
      and hm.account_id = auth.uid()
      and hm.is_admin = true
  );
$$;

-- ---- Tightened RLS on household_members ----

-- Delete: owner/admin can remove anyone; a member can remove only themselves
-- (leave). The owner's own membership can never be deleted (transfer first).
drop policy if exists household_members_delete on public.household_members;
create policy household_members_delete on public.household_members
  for delete using (
    (
      public.owns_household(household_members.household_id)
      or public.is_household_admin(household_members.household_id)
      or household_members.account_id = auth.uid()
    )
    and not exists (
      select 1 from public.households h
      where h.id = household_members.household_id
        and h.owner_account_id = household_members.account_id
    )
  );

-- Insert: owner/admin may add anyone; a regular member may only insert a row
-- that is held for approval.
drop policy if exists household_members_insert on public.household_members;
create policy household_members_insert on public.household_members
  for insert with check (
    public.owns_household(household_id)
    or public.is_household_admin(household_id)
    or (public.is_household_member(household_id) and approval_pending = true)
  );

-- Update: keep the membership-scoped policy, but restrict WHICH columns a client
-- can change via column privileges. Everything sensitive flows through the RPCs.
revoke update on public.household_members from authenticated;
grant update (name, avatar, notify_on_spend) on public.household_members to authenticated;

-- Households: owner + admins can edit name/color/week start, but only column
-- privileges + transfer_ownership() can ever change the owner.
drop policy if exists households_update on public.households;
create policy households_update on public.households
  for update using (owner_account_id = auth.uid() or public.is_household_admin(id))
  with check (owner_account_id = auth.uid() or public.is_household_admin(id));

revoke update on public.households from authenticated;
grant update (name, color, week_start_day) on public.households to authenticated;

-- ---- Privileged transitions (each re-checks the caller) ----

-- Approve a pending member add (owner/admin). Returns the invite_email to send,
-- or null (fun-money-only member, or nothing to approve).
create or replace function public.approve_member(p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hid uuid;
  v_email text;
begin
  select household_id, invite_email into v_hid, v_email
  from household_members
  where id = p_member_id and approval_pending = true;
  if v_hid is null then
    return null;
  end if;
  if not (public.owns_household(v_hid) or public.is_household_admin(v_hid)) then
    raise exception 'not authorized to approve members';
  end if;
  update household_members set approval_pending = false where id = p_member_id;
  return v_email;
end;
$$;

-- Grant/revoke admin ("share ownership"). OWNER only. Can't touch the owner row.
create or replace function public.set_member_admin(p_member_id uuid, p_is_admin boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hid uuid;
  v_acct uuid;
begin
  select household_id, account_id into v_hid, v_acct from household_members where id = p_member_id;
  if v_hid is null then return false; end if;
  if not public.owns_household(v_hid) then
    raise exception 'only the owner can change admins';
  end if;
  if v_acct is null then
    raise exception 'that member has no account yet';
  end if;
  if exists (select 1 from households h where h.id = v_hid and h.owner_account_id = v_acct) then
    raise exception 'the owner is always an admin';
  end if;
  update household_members set is_admin = p_is_admin where id = p_member_id;
  return true;
end;
$$;

-- Transfer ownership to another member (OWNER only). Old owner becomes an admin.
create or replace function public.transfer_ownership(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hid uuid;
  v_new_acct uuid;
  v_old_owner uuid;
begin
  select household_id, account_id into v_hid, v_new_acct from household_members where id = p_member_id;
  if v_hid is null or v_new_acct is null then return false; end if;
  if not public.owns_household(v_hid) then
    raise exception 'only the owner can transfer ownership';
  end if;
  select owner_account_id into v_old_owner from households where id = v_hid;
  update households set owner_account_id = v_new_acct where id = v_hid;
  update household_members set is_admin = true where id = p_member_id;
  update household_members set is_admin = true where household_id = v_hid and account_id = v_old_owner;
  return true;
end;
$$;

grant execute on function public.is_household_admin(uuid) to authenticated;
grant execute on function public.approve_member(uuid) to authenticated;
grant execute on function public.set_member_admin(uuid, boolean) to authenticated;
grant execute on function public.transfer_ownership(uuid) to authenticated;
