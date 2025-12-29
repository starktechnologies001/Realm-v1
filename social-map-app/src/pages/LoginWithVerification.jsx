// This file contains the complete email verification handlers
// Copy these functions and add them to your Login.jsx file

// ADD THESE HANDLER FUNCTIONS BEFORE handleAuth (around line 85)

const handleSendVerificationCode = async () => {
  if (!email.trim()) {
    setError("Please enter your email address first.");
    return;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    setError("Please enter a valid email address.");
    return;
  }

  setLoading(true);
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: email,
      options: {
        shouldCreateUser: false,
      }
    });

    if (error) throw error;

    setShowVerificationInput(true);
    setError("✅ Verification code sent! Check your email.");
    setTimeout(() => setError(""), 3000);
  } catch (err) {
    setError(err.message || "Failed to send verification code");
  } finally {
    setLoading(false);
  }
};

const handleVerifyCode = async () => {
  if (!verificationCode.trim()) {
    setError("Please enter the verification code.");
    return;
  }

  setLoading(true);
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email,
      token: verificationCode,
      type: 'email'
    });

    if (error) throw error;

    setIsEmailVerified(true);
    setError("✅ Email verified successfully!");
    setShowVerificationInput(false);
    
    await supabase.auth.signOut();
    
    setTimeout(() => setError(""), 3000);
  } catch (err) {
    setError("Invalid verification code. Please try again.");
  } finally {
    setLoading(false);
  }
};
