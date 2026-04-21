ALTER TABLE public.health
ADD COLUMN IF NOT EXISTS height_ft numeric,
ADD COLUMN IF NOT EXISTS weight_lbs numeric;
