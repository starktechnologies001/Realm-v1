-- Database migration to enforce Super Poke limits and anti-spam constraints on the backend

-- 1. Ensure columns exist on public.profiles (already added in premium membership setup, but safe to verify)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS super_poke_count_today INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_super_poke_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Ensure columns exist on public.friendships
ALTER TABLE public.friendships ADD COLUMN IF NOT EXISTS is_super_poke BOOLEAN DEFAULT FALSE;
ALTER TABLE public.friendships ADD COLUMN IF NOT EXISTS is_diamond_poke BOOLEAN DEFAULT FALSE;

-- 3. Create check_super_poke_limits trigger function
CREATE OR REPLACE FUNCTION public.check_super_poke_limits()
RETURNS TRIGGER AS $$
DECLARE
    sender_tier TEXT;
    sender_last_poke TIMESTAMPTZ;
    sender_poke_count INTEGER;
    is_blocked BOOLEAN;
    last_sent_to_receiver TIMESTAMPTZ;
BEGIN
    -- Only execute validations for Super Pokes (Gold/Diamond pokes)
    IF NEW.is_super_poke = TRUE OR NEW.is_diamond_poke = TRUE THEN
        
        -- A. Block sending if the receiver has blocked the sender or vice versa
        SELECT EXISTS (
            SELECT 1 FROM public.blocked_users
            WHERE (blocker_id = NEW.requester_id AND blocked_id = NEW.receiver_id)
               OR (blocker_id = NEW.receiver_id AND blocked_id = NEW.requester_id)
        ) INTO is_blocked;
        
        IF is_blocked THEN
            RAISE EXCEPTION 'Cannot send Super Poke: block active between users';
        END IF;

        -- B. Fetch sender's subscription tier and daily tracking variables
        SELECT subscription_tier, last_super_poke_at, super_poke_count_today
        INTO sender_tier, sender_last_poke, sender_poke_count
        FROM public.profiles
        WHERE id = NEW.requester_id;

        -- C. Validate Subscription Tier access
        IF sender_tier IS NULL OR sender_tier = 'free' OR sender_tier = 'silver' THEN
            RAISE EXCEPTION 'Super Pokes are a premium feature. Please upgrade to Gold or Diamond Elite.';
        END IF;

        -- D. Enforce 30-second cooldown between Super Pokes
        IF sender_last_poke IS NOT NULL AND (now() - sender_last_poke) < INTERVAL '30 seconds' THEN
            RAISE EXCEPTION 'Spam Prevention: Please wait 30 seconds between sending Super Pokes.';
        END IF;

        -- E. Prevent sending multiple Super Pokes to the same user repeatedly (5-minute cooldown per target user)
        SELECT MAX(created_at) INTO last_sent_to_receiver
        FROM public.friendships
        WHERE requester_id = NEW.requester_id 
          AND receiver_id = NEW.receiver_id 
          AND (is_super_poke = TRUE OR is_diamond_poke = TRUE);
        
        IF last_sent_to_receiver IS NOT NULL AND (now() - last_sent_to_receiver) < INTERVAL '5 minutes' THEN
            RAISE EXCEPTION 'Spam Prevention: You cannot send multiple Super Pokes to the same user repeatedly.';
        END IF;

        -- F. Reset usage count automatically if last activity was more than 24 hours ago
        IF sender_last_poke IS NULL OR (now() - sender_last_poke) >= INTERVAL '24 hours' THEN
            sender_poke_count := 0;
        END IF;

        -- G. Enforce Daily Tier Limits (5 for Gold, 10 for Diamond)
        IF sender_tier = 'gold' AND sender_poke_count >= 5 THEN
            RAISE EXCEPTION 'Daily Limit Reached: Gold membership is limited to 5 Super Pokes per 24 hours.';
        ELSIF sender_tier = 'diamond' AND sender_poke_count >= 10 THEN
            RAISE EXCEPTION 'Daily Limit Reached: Diamond membership is limited to 10 Super Pokes per 24 hours.';
        END IF;

        -- H. Update Sender's daily tracking count and timestamp atomically on the backend
        UPDATE public.profiles
        SET super_poke_count_today = sender_poke_count + 1,
            last_super_poke_at = now()
        WHERE id = NEW.requester_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create trigger to bind to the friendships table
DROP TRIGGER IF EXISTS trg_check_super_poke_limits ON public.friendships;
CREATE TRIGGER trg_check_super_poke_limits
BEFORE INSERT ON public.friendships
FOR EACH ROW
EXECUTE FUNCTION public.check_super_poke_limits();
