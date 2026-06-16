-- 1. Remove the default value 'Other' from the gender column in the profiles table
ALTER TABLE public.profiles ALTER COLUMN gender DROP DEFAULT;

-- 2. Update existing profiles where onboarding is not complete to have NULL gender (so it doesn't pre-select)
UPDATE public.profiles 
SET gender = NULL 
WHERE onboarding_completed = false;
