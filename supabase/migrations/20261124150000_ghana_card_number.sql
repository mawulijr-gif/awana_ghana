ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS identification_number text NOT NULL DEFAULT '';
