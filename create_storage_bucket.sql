-- Create the storage bucket 'story-media'
INSERT INTO storage.buckets (id, name, public)
VALUES ('story-media', 'story-media', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects if not already enabled (usually is by default)
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Remove existing policies to avoid conflicts if re-running
DROP POLICY IF EXISTS "Authenticated users can upload stories" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view stories" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own story files" ON storage.objects;

-- 1. Allow authenticated users to upload files to 'story-media'
CREATE POLICY "Authenticated users can upload stories"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'story-media' AND
  auth.role() = 'authenticated'
);

-- 2. Allow public access to view files in 'story-media'
CREATE POLICY "Anyone can view stories"
ON storage.objects FOR SELECT
USING ( bucket_id = 'story-media' );

-- 3. Allow users to delete their own files (owner column usually matches auth.uid())
CREATE POLICY "Users can delete their own story files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'story-media' AND
  auth.uid() = owner
);
