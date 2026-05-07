create extension if not exists pgcrypto;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  description text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint departments_tenant_fk
    foreign key (tenant_id)
    references public.tenants(id)
    on delete cascade
);

create index if not exists departments_tenant_id_idx
  on public.departments (tenant_id);

create unique index if not exists departments_tenant_name_unique_idx
  on public.departments (tenant_id, lower(name));

alter table public.profiles
  add column if not exists department_id uuid;

alter table public.profiles
  add column if not exists status text not null default 'active';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_department_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_department_id_fkey
      foreign key (department_id)
      references public.departments(id)
      on delete set null;
  end if;
end $$;

create or replace function public.set_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_departments_set_updated_at on public.departments;
create trigger trg_departments_set_updated_at
before update on public.departments
for each row
execute function public.set_updated_at_column();

alter table public.departments enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'departments'
      and policyname = 'departments_select_same_tenant'
  ) then
    create policy departments_select_same_tenant
      on public.departments
      for select
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.tenant_id = departments.tenant_id
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'departments'
      and policyname = 'departments_insert_admin'
  ) then
    create policy departments_insert_admin
      on public.departments
      for insert
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.tenant_id = departments.tenant_id
            and p.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'departments'
      and policyname = 'departments_update_admin'
  ) then
    create policy departments_update_admin
      on public.departments
      for update
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.tenant_id = departments.tenant_id
            and p.role = 'admin'
        )
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.tenant_id = departments.tenant_id
            and p.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'departments'
      and policyname = 'departments_delete_admin'
  ) then
    create policy departments_delete_admin
      on public.departments
      for delete
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.tenant_id = departments.tenant_id
            and p.role = 'admin'
        )
      );
  end if;
end $$;
