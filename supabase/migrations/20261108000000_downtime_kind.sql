-- New limit kind: block during a daily time window (e.g. bedtime 22:00–07:00).
-- (Kept in its own migration: a new enum value can't be used in the same transaction.)
alter type public.limit_kind add value if not exists 'downtime';
