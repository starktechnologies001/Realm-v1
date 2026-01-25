SELECT * FROM pg_policies WHERE tablename = 'friendships';
-- Also check if implicit select is allowed
-- Try to grant select if missing?
-- Actually, let's just create a policy that ensures it works.
