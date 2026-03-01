-- Care circle: primary-only invites + multi-profile fanout support.

BEGIN;

-- Deduplicate by (requester, recipient, profile), keeping highest-priority status.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY requester_id, recipient_id, profile_id
      ORDER BY
        CASE status
          WHEN 'accepted' THEN 3
          WHEN 'pending' THEN 2
          WHEN 'declined' THEN 1
          ELSE 0
        END DESC,
        COALESCE(updated_at, created_at, NOW()) DESC,
        created_at DESC,
        id DESC
    ) AS row_num
  FROM public.care_circle_links
)
DELETE FROM public.care_circle_links target
USING ranked
WHERE target.id = ranked.id
  AND ranked.row_num > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_care_circle_links_requester_recipient_profile_unique
  ON public.care_circle_links (requester_id, recipient_id, profile_id);

CREATE INDEX IF NOT EXISTS idx_care_circle_links_requester_recipient
  ON public.care_circle_links (requester_id, recipient_id);

CREATE OR REPLACE FUNCTION public.handle_new_profile_care_circle_fanout()
RETURNS TRIGGER AS $$
DECLARE
  owner_auth_id UUID;
BEGIN
  owner_auth_id := COALESCE(NEW.auth_id, NEW.user_id);

  IF owner_auth_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.care_circle_links (
    requester_id,
    recipient_id,
    profile_id,
    status,
    relationship,
    created_at,
    updated_at
  )
  SELECT
    owner_auth_id,
    pairs.recipient_id,
    NEW.id,
    'accepted',
    COALESCE(pairs.primary_relationship, 'friend'),
    NOW(),
    NOW()
  FROM (
    SELECT
      links.recipient_id,
      (
        SELECT primary_link.relationship
        FROM public.care_circle_links primary_link
        JOIN public.profiles primary_profile
          ON primary_profile.id = primary_link.profile_id
        WHERE primary_link.requester_id = owner_auth_id
          AND primary_link.recipient_id = links.recipient_id
          AND primary_link.status = 'accepted'
          AND primary_profile.is_primary = TRUE
        ORDER BY
          COALESCE(primary_link.updated_at, primary_link.created_at, NOW()) DESC,
          primary_link.created_at DESC,
          primary_link.id DESC
        LIMIT 1
      ) AS primary_relationship
    FROM public.care_circle_links links
    WHERE links.requester_id = owner_auth_id
      AND links.status = 'accepted'
    GROUP BY links.recipient_id
  ) AS pairs
  ON CONFLICT (requester_id, recipient_id, profile_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created_care_circle_fanout ON public.profiles;
CREATE TRIGGER on_profile_created_care_circle_fanout
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_profile_care_circle_fanout();

COMMENT ON FUNCTION public.handle_new_profile_care_circle_fanout() IS
  'Auto-shares newly created profiles with recipients already accepted in requester care-circle links.';

COMMIT;
