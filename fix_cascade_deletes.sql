-- Fix CASCADE Delete issues preventing user deletion

-- START CLEANUP: Remove orphaned data that violates FK constraints (REFERENCES TO NON-EXISTENT USERS)
-- This MUST happen before we can add the strict constraints.

DELETE FROM public.chat_settings 
WHERE user_id NOT IN (SELECT id FROM public.profiles) 
OR partner_id NOT IN (SELECT id FROM public.profiles);

DELETE FROM public.shared_themes 
WHERE user_1 NOT IN (SELECT id FROM public.profiles) 
OR user_2 NOT IN (SELECT id FROM public.profiles);

DELETE FROM public.friendships 
WHERE requester_id NOT IN (SELECT id FROM public.profiles) 
OR receiver_id NOT IN (SELECT id FROM public.profiles);

DELETE FROM public.messages 
WHERE sender_id NOT IN (SELECT id FROM public.profiles) 
OR receiver_id NOT IN (SELECT id FROM public.profiles);

-- END CLEANUP --


-- 1. Fix Chat Settings
ALTER TABLE public.chat_settings
DROP CONSTRAINT IF EXISTS chat_settings_user_id_fkey,
DROP CONSTRAINT IF EXISTS chat_settings_partner_id_fkey;

ALTER TABLE public.chat_settings
ADD CONSTRAINT chat_settings_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
ADD CONSTRAINT chat_settings_partner_id_fkey
FOREIGN KEY (partner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


-- 2. Fix Shared Themes
ALTER TABLE public.shared_themes
DROP CONSTRAINT IF EXISTS shared_themes_user_1_fkey,
DROP CONSTRAINT IF EXISTS shared_themes_user_2_fkey;

ALTER TABLE public.shared_themes
ADD CONSTRAINT shared_themes_user_1_fkey
FOREIGN KEY (user_1) REFERENCES public.profiles(id) ON DELETE CASCADE,
ADD CONSTRAINT shared_themes_user_2_fkey
FOREIGN KEY (user_2) REFERENCES public.profiles(id) ON DELETE CASCADE;


-- 3. Fix Profiles referencing Auth.Users (Critical)
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_id_fkey
FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- 4. Fix Friendships (Usually a blocker)
ALTER TABLE public.friendships
DROP CONSTRAINT IF EXISTS friendships_requester_id_fkey,
DROP CONSTRAINT IF EXISTS friendships_receiver_id_fkey;

ALTER TABLE public.friendships
ADD CONSTRAINT friendships_requester_id_fkey
FOREIGN KEY (requester_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
ADD CONSTRAINT friendships_receiver_id_fkey
FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


-- 5. Fix Messages (Usually a blocker)
ALTER TABLE public.messages
DROP CONSTRAINT IF EXISTS messages_sender_id_fkey,
DROP CONSTRAINT IF EXISTS messages_receiver_id_fkey;

ALTER TABLE public.messages
ADD CONSTRAINT messages_sender_id_fkey
FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
ADD CONSTRAINT messages_receiver_id_fkey
FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
