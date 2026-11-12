-- Urbania Cabs: run this script in Supabase SQL Editor.
-- The service-role key is used only by Vercel server functions. Never expose it in the browser.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer','staff','admin','owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_id uuid references public.profiles(id) on delete set null,
  trip_type text not null check (trip_type in ('outstation','local','airport','corporate')),
  status text not null default 'new' check (status in ('new','contacted','quoted','confirmed','completed','cancelled')),
  customer_name text not null,
  contact_person text,
  company text,
  phone text not null,
  email text,
  pickup text not null,
  drop_location text,
  passengers integer check (passengers is null or passengers between 1 and 60),
  vehicle_preference text,
  pickup_date date,
  pickup_time time,
  details jsonb not null default '{}'::jsonb,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookings_created_at_idx on public.bookings (created_at desc);
create index if not exists bookings_status_idx on public.bookings (status);
create index if not exists bookings_phone_idx on public.bookings (phone);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  registration_number text unique,
  seats integer check (seats is null or seats > 0),
  status text not null default 'available' check (status in ('available','assigned','maintenance','inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  license_number text unique,
  status text not null default 'available' check (status in ('available','assigned','inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_assignments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  unique (booking_id)
);

-- Private-by-default. All privileged access is performed by Vercel using
-- SUPABASE_SERVICE_ROLE_KEY after server-side authentication/role checks.
alter table public.profiles enable row level security;
alter table public.bookings enable row level security;
alter table public.vehicles enable row level security;
alter table public.drivers enable row level security;
alter table public.booking_assignments enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

-- Do not create public/anon policies for bookings, fleet, drivers or assignments.
-- Create the first admin profile only after the owner has signed up:
-- update public.profiles set role = 'owner' where id = '<AUTH_USER_UUID>';
-- Create a profile row for a signed-up user with:
-- insert into public.profiles (id, full_name, role)
-- select id, 'Business Owner', 'owner' from auth.users where email = 'YOUR_OWNER_EMAIL';
