-- Enable public access to 'chat-images' bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Remove conflicting policies to start fresh (optional, but safe)
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads to chat-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public select" ON storage.objects;

-- 1. Allow Public Read Access (Select) for all files in chat-images
CREATE POLICY "Allow public select on chat-images"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'chat-images' );

-- 2. Allow Public Upload Access (Insert) ONLY to the 'public' folder
-- This allows anonymous users (signup flow) to upload their initial avatar
CREATE POLICY "Allow public uploads to chat-images public folder"
ON storage.objects FOR INSERT
TO public
WITH CHECK ( 
    bucket_id = 'chat-images' 
    AND (storage.foldername(name))[1] = 'public'
);

-- 3. Allow Authenticated users to upload anywhere in chat-images
CREATE POLICY "Allow authenticated uploads to chat-images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'chat-images' );
