import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function LegalPage() {
    const { section } = useParams();
    const navigate = useNavigate();

    const contentMap = {
        'privacy': {
            title: 'Privacy Policy',
            content: (
                <div className="legal-text-block">
                    <p className="intro"><strong>Effective Date:</strong> July 2026</p>
                    <p>At Nearo, your privacy and safety are our highest priorities. This Privacy Policy explains how we collect, use, and protect your information when you use our location-based social networking application.</p>
                    
                    <h3>1. Information We Collect</h3>
                    <p>To provide you with the best experience, we collect the following types of information:</p>
                    <ul>
                        <li><strong>Account Information:</strong> Name, email address, date of birth, and profile customization details.</li>
                        <li><strong>Location Data:</strong> Real-time and approximate location data when you have granted device permissions.</li>
                        <li><strong>Communications:</strong> Messages, voice call metadata, and video call metadata shared with friends.</li>
                        <li><strong>Device Information:</strong> Operating system, device type, and unique device identifiers for push notifications.</li>
                        <li><strong>Analytics:</strong> App usage metrics to help us improve performance and user experience.</li>
                    </ul>

                    <h3>2. How We Use Information</h3>
                    <p>We use your data to operate Nearo, connect you with nearby users, process your Premium Subscriptions, enforce our Community Guidelines, and prevent fraud or abuse.</p>

                    <h3>3. Location Data</h3>
                    <p>Location sharing is the core of Nearo, and you are always in control:</p>
                    <ul>
                        <li><strong>Approximate Location:</strong> To protect your privacy from strangers, your exact coordinates are fuzzed. We only show your approximate location to non-friends.</li>
                        <li><strong>Ghost Mode:</strong> You can instantly hide your location from everyone by toggling "Ghost Mode" in your settings.</li>
                        <li><strong>Friends Visibility:</strong> You can configure your location to only be visible to accepted friends.</li>
                        <li><strong>Permissions:</strong> Location data is only collected if you explicitly grant OS-level permissions.</li>
                    </ul>

                    <h3>4. Chats & Calls</h3>
                    <p>We want your private conversations to remain private, while keeping the community safe:</p>
                    <ul>
                        <li><strong>Storage:</strong> One-to-one chat messages are securely stored to allow cross-device syncing.</li>
                        <li><strong>Reporting & Abuse:</strong> If you encounter abusive behavior, you can report messages or accounts. When reported, recent chat history may be reviewed by our Trust & Safety team.</li>
                    </ul>

                    <h3>5. Premium Subscriptions</h3>
                    <p>If you purchase a Nearo Premium subscription, payment processing is handled securely by our App Store partners (Apple and Google). Nearo does not store or process your raw credit card data.</p>

                    <h3>6. Cookies & Tracking</h3>
                    <p>If you access Nearo via the web, we use strictly necessary cookies to keep you logged in and functional cookies to remember your preferences (such as dark mode settings). We do not use third-party advertising cookies.</p>

                    <h3>7. Third-Party Services</h3>
                    <p>We utilize trusted third-party providers to power Nearo's infrastructure. These providers only process data as necessary to provide their services:</p>
                    <ul>
                        <li><strong>Supabase:</strong> For secure database hosting and user authentication.</li>
                        <li><strong>Agora:</strong> To power low-latency voice and video calls.</li>
                        <li><strong>Mapping Services:</strong> Leaflet and external map providers to render the interactive map.</li>
                        <li><strong>Push Notifications:</strong> Apple APNs and Firebase Cloud Messaging (FCM) to deliver alerts.</li>
                    </ul>

                    <h3>8. Data Retention & Account Deletion Policy</h3>
                    <p>We retain your personal data only as long as your account is active. We employ a <strong>Hybrid Immediate-Delete Strategy</strong> when you choose to delete your account:</p>
                    <ul>
                        <li><strong>Hard Deleted (Instant):</strong> Your profile metadata, location history, friends list, chat messages, and uploaded media (avatars and photos) are immediately and permanently destroyed from our active databases.</li>
                        <li><strong>Anonymized & Retained:</strong> Trust & Safety reports you submitted are stripped of your identity (anonymized) but retained. This ensures that safety investigations against bad actors are not compromised by your departure.</li>
                        <li><strong>Subscriptions:</strong> Deleting your account does not automatically cancel third-party billing. Active App Store or Google Play subscriptions must be cancelled manually via your device settings.</li>
                    </ul>

                    <h3>10. User Rights</h3>
                    <p>Depending on your region (e.g., GDPR in Europe, DPDP in India), you have the right to access, rectify, or erase your personal data. You may also withdraw your consent for location sharing at any time by modifying your device settings.</p>

                    <h3>11. Contact Information</h3>
                    <p>If you have questions or concerns regarding this policy, or wish to exercise your data rights, please contact our Privacy Team at <strong>nearoprivacy@gmail.com</strong>.</p>

                    <h3>12. Policy Updates</h3>
                    <p>We may update this Privacy Policy from time to time. If we make material changes, we will notify you via a prominent in-app notification before the changes take effect.</p>
                </div>
            )
        },
        'terms': {
            title: 'Terms of Service',
            content: (
                <div className="legal-text-block">
                    <p className="intro"><strong>Effective Date:</strong> July 2026</p>
                    <p>Welcome to Nearo. By accessing or using our location-based social networking application, you agree to be bound by these Terms & Conditions ("Terms"). If you do not agree to all of these Terms, you may not use our services.</p>

                    <h3>1. Acceptance of Terms</h3>
                    <p>By creating an account, downloading our app, or using our services, you confirm your acceptance of these Terms and agree to comply with them. We may update these Terms periodically, and continued use constitutes acceptance of those changes.</p>

                    <h3>2. Eligibility</h3>
                    <p>You must be at least 18 years old to create an account on Nearo. By using the app, you represent and warrant that you meet this age requirement and that all registration information you submit is accurate, truthful, and up-to-date. You are responsible for maintaining the accuracy of this information.</p>

                    <h3>3. User Accounts</h3>
                    <ul>
                        <li><strong>Account Creation:</strong> You must create an account to access core features. You agree not to create an account for anyone other than yourself.</li>
                        <li><strong>Account Security:</strong> You are strictly responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account.</li>
                        <li><strong>Suspension and Termination:</strong> We reserve the right to suspend or terminate your account at our sole discretion, without notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties.</li>
                    </ul>

                    <h3>4. Acceptable Use</h3>
                    <p>Nearo is a community built on trust. You strictly agree NOT to use the app for any of the following prohibited activities:</p>
                    <ul>
                        <li>Harassment, bullying, or stalking.</li>
                        <li>Making threats or inciting violence.</li>
                        <li>Hate speech or discrimination.</li>
                        <li>Spamming or unwanted commercial solicitation.</li>
                        <li>Creating fake accounts or impersonation.</li>
                        <li>Any illegal activities.</li>
                        <li>Adult exploitation or sharing sexually explicit content.</li>
                        <li>Child exploitation (which will be reported to relevant authorities immediately).</li>
                        <li>Selling illegal products or substances.</li>
                        <li>Fraud, phishing, or scamming.</li>
                        <li>Hacking, bypassing security measures, or spreading malware.</li>
                        <li>Reverse engineering the Nearo application.</li>
                        <li>Automated scraping of user data or locations.</li>
                        <li>Operating bot accounts.</li>
                    </ul>

                    <h3>5. Location Services</h3>
                    <p>Location sharing is a core feature of Nearo. By using the app, you acknowledge that:</p>
                    <ul>
                        <li>You are always in control of your location sharing preferences.</li>
                        <li>You may disable location permissions entirely at the OS level.</li>
                        <li>An approximate (fuzzed) location may be shown to non-friends to protect your privacy.</li>
                        <li><strong>Ghost Mode</strong> is available to hide your location instantly.</li>
                        <li><strong>Nearo is not responsible for offline interactions between users.</strong> You assume all risks associated with meeting other users in person.</li>
                    </ul>

                    <h3>6. Messaging & Calls</h3>
                    <p>Nearo provides text, voice, and video communication features:</p>
                    <ul>
                        <li>You are solely responsible for all content you transmit during communications.</li>
                        <li>Abuse of these features (e.g., sending unsolicited explicit material) will result in immediate account suspension.</li>
                        <li>Report and Block features are available and should be used to manage unwanted interactions.</li>
                        <li>All calls and chats must strictly comply with our Community Guidelines.</li>
                    </ul>

                    <h3>7. Premium Subscription</h3>
                    <p>Nearo offers a Premium Subscription unlocking additional profile features:</p>
                    <ul>
                        <li><strong>Billing & Renewal:</strong> Subscriptions are billed automatically on a recurring basis via your respective App Store (Apple or Google).</li>
                        <li><strong>Cancellation:</strong> You may cancel your subscription at any time through your App Store account settings. Cancellation stops future billing.</li>
                        <li><strong>Refunds:</strong> Refunds are handled according to our Refund Policy and the policies of the respective App Store where the purchase was made.</li>
                    </ul>

                    <h3>8. Intellectual Property</h3>
                    <p>All Nearo branding, logos, trademarks, and source code remain the exclusive property of Nearo and its licensors. You retain ownership of the user-generated content you upload. However, by uploading content, you grant Nearo a worldwide, royalty-free license to host, store, use, and display that content within the service.</p>

                    <h3>9. Privacy</h3>
                    <p>Your privacy is critical to us. Please refer to our <a href="/legal/privacy" style={{ color: 'var(--brand-blue, #007AFF)' }}>Privacy Policy</a> for detailed information on how we collect, use, and protect your data.</p>

                    <h3>10. Limitation of Liability</h3>
                    <p>To the maximum extent permitted by law, Nearo shall not be liable for any indirect, incidental, special, consequential, or punitive damages. <strong>Nearo cannot guarantee user behavior or safety during offline meetings and is not liable for interactions between users beyond applicable law.</strong> Use caution and common sense when interacting with strangers.</p>

                    <h3>11. Account Suspension</h3>
                    <p>If we determine, at our sole discretion, that you have violated these Terms, we may take action against your account, ranging from a temporary warning to a permanent ban, without a refund for any Premium Subscription time remaining.</p>
                </div>
            )
        },

        'safety': {
            title: 'Safety Center',
            content: (
                <div className="legal-text-block">
                    <p className="intro">Nearo connects you with real people in the real world. Your safety is our top priority. Here are the tools available to you and the tips we recommend for staying safe.</p>

                    <h3>🛡️ In-App Safety Tools</h3>
                    <ul>
                        <li><strong>Ghost Mode:</strong> Go invisible on the map instantly. No one — including friends — will see your real-time location while Ghost Mode is active.</li>
                        <li><strong>Block:</strong> Block any user immediately. They will be removed from your map and cannot contact you.</li>
                        <li><strong>Report:</strong> Report profiles, messages, or suspicious behavior. Our safety team reviews every report within 24 hours.</li>
                        <li><strong>Location Review:</strong> Regularly audit your friends list. Remove anyone you no longer trust with access to your location.</li>
                    </ul>

                    <h3>🌍 Real-World Safety</h3>
                    <ul>
                        <li><strong>Meet in Public:</strong> Always meet new people in well-lit, busy public places.</li>
                        <li><strong>Tell Someone:</strong> Inform a trusted friend or family member before meeting someone from the app.</li>
                        <li><strong>Trust Your Instincts:</strong> If something feels off, leave and stop sharing your location immediately.</li>
                    </ul>

                    <h3>🆘 Emergency</h3>
                    <p>If you or someone else is in immediate danger, <strong>do not rely solely on in-app reporting</strong>. Please contact your local emergency services directly.</p>

                    <h3>📞 Contact Safety Team</h3>
                    <p>Have a safety concern? Reach us at <a href="mailto:nearoprivacy@gmail.com" style={{ color: 'var(--brand-blue, #007AFF)', textDecoration: 'none' }}>nearoprivacy@gmail.com</a>. We respond as quickly as possible.</p>
                </div>
            )
        },

        'safety-tips': {
            title: 'Safety Tips',
            content: (
                <div className="legal-text-block">
                    <p className="intro">Following these safety tips helps protect you, your data, and your wellbeing while using Nearo.</p>

                    <h3>🔐 Account & Credentials</h3>
                    <ul>
                        <li><strong>Never share your password</strong> with anyone, including people claiming to be Nearo staff.</li>
                        <li><strong>Never share OTPs</strong> (One-Time Passwords) or verification codes received via SMS or email.</li>
                        <li>Use a strong, unique password for your Nearo account.</li>
                        <li>Enable any available two-factor authentication on your email account.</li>
                    </ul>

                    <h3>💳 Financial Safety</h3>
                    <ul>
                        <li><strong>Never share financial information</strong> such as bank details, card numbers, or UPI/payment credentials with anyone on the platform.</li>
                        <li>Nearo will <strong>never</strong> ask you for your payment credentials directly.</li>
                        <li>Be wary of any user who asks you to pay money, buy vouchers, or transfer funds.</li>
                    </ul>

                    <h3>📍 Meeting Safely</h3>
                    <ul>
                        <li>Meet people only in <strong>public places</strong> with high foot traffic.</li>
                        <li>Tell a <strong>trusted person</strong> where you are going before any meetup.</li>
                        <li>Do not share your home or work address with strangers on the app.</li>
                    </ul>

                    <h3>💬 Communication Safety</h3>
                    <ul>
                        <li><strong>Never send intimate content</strong> to people you do not fully trust. Once sent, you lose control of it.</li>
                        <li>Respect other users' privacy. Do not record or share conversations without consent.</li>
                        <li>Report and block anyone who makes you feel uncomfortable.</li>
                    </ul>

                    <h3>⚠️ Suspicious Behavior</h3>
                    <ul>
                        <li>Report users who appear suspicious, aggressive, or who are soliciting money or personal information.</li>
                        <li>Be cautious of accounts with no profile photo or very new accounts asking for personal details.</li>
                    </ul>

                    <h3>🆘 Emergency</h3>
                    <p>If you believe you or someone else is in immediate danger, contact your local emergency services. In-app reporting alone is not a substitute for emergency assistance.</p>
                </div>
            )
        },

        'child-safety': {
            title: 'Child Safety Policy',
            content: (
                <div className="legal-text-block">
                    <p className="intro" style={{ color: '#dc2626', fontWeight: 600 }}>Nearo has a strict zero-tolerance policy for any content or behavior that endangers children. This policy is non-negotiable.</p>

                    <h3>1. Our Commitment to Child Safety</h3>
                    <p>The safety and protection of children is a fundamental, non-negotiable value at Nearo. We are committed to maintaining a platform environment that is safe, responsible, and free from any form of child exploitation or abuse.</p>

                    <h3>2. Age Requirement</h3>
                    <p>Nearo is intended exclusively for users who are <strong>18 years of age or older</strong>, or who meet the minimum age requirement prescribed by applicable laws in their jurisdiction. By creating an account, users confirm they meet this requirement. If we discover that a user is underage, the account will be permanently deleted immediately.</p>

                    <h3>3. Zero Tolerance Policy</h3>
                    <p>Nearo strictly prohibits the following on our platform:</p>
                    <ul>
                        <li><strong>Child Sexual Abuse Material (CSAM)</strong> — including any production, sharing, or possession.</li>
                        <li><strong>Child exploitation</strong> of any kind, including financial, labor, or sexual exploitation.</li>
                        <li><strong>Child grooming</strong> — building a relationship with a minor to facilitate exploitation.</li>
                        <li><strong>Human trafficking</strong> involving minors.</li>
                        <li><strong>Sexual extortion</strong> targeting minors.</li>
                        <li>Any other harmful content or behavior directed at or involving children.</li>
                    </ul>

                    <h3>4. Reporting Child Safety Concerns</h3>
                    <p>If you encounter any content or behavior that may endanger a child, <strong>please report it immediately</strong>:</p>
                    <ul>
                        <li>Use the Report button on the user's profile or in the chat.</li>
                        <li>Contact our safety team directly at <strong>nearoprivacy@gmail.com</strong> with details.</li>
                        <li>If you believe a child is in immediate danger, <strong>contact local emergency services first</strong>.</li>
                    </ul>
                    <p>You can also report suspected child exploitation to the relevant national authority in your country (such as NCMEC in the United States, or the equivalent body in your jurisdiction).</p>

                    <h3>5. Enforcement</h3>
                    <p>Any user found to be violating this policy will face immediate and severe action, including but not limited to:</p>
                    <ul>
                        <li>Immediate content removal.</li>
                        <li>Immediate and permanent account suspension and ban.</li>
                        <li>Full cooperation with law enforcement agencies, including providing all legally required information.</li>
                        <li>Reporting to relevant child protection authorities and organizations.</li>
                    </ul>

                    <h3>6. Contact Information</h3>
                    <p>To report child safety concerns directly to our trust and safety team, contact us at <strong>nearoprivacy@gmail.com</strong>. Reports related to child safety are treated with the highest urgency and confidentiality.</p>
                </div>
            )
        },

        'guidelines': {
            title: 'Community Guidelines',
            content: (
                <div className="legal-text-block">
                    <p className="intro">Nearo is built on trust, respect, and safety. To keep our community thriving, we require all users to adhere to these Community Guidelines. Violations will result in strict enforcement.</p>

                    <h3>1. Respect Everyone</h3>
                    <p>We are a diverse community. You must respect others and be polite. We have zero tolerance for harassment, bullying, or discrimination based on race, religion, gender, sexual orientation, or disability.</p>

                    <h3>2. Prohibited Content</h3>
                    <p>To ensure a safe environment, the following are strictly prohibited on Nearo:</p>
                    <ul>
                        <li>Hate speech, racism, and religious hatred.</li>
                        <li>Support for terrorism, violence, or threats.</li>
                        <li>Bullying, harassment, sexual harassment, and stalking.</li>
                        <li>Blackmail and revenge content.</li>
                        <li>Nudity, pornography, and sexually explicit material.</li>
                        <li>Child exploitation (which will be immediately reported to law enforcement).</li>
                        <li>Illegal activities, including drug and weapon sales.</li>
                        <li>Promotion of gambling, fraud, phishing, or scams.</li>
                        <li>Fake giveaways and money laundering.</li>
                        <li>Spam, bot accounts, fake profiles, and identity impersonation.</li>
                    </ul>

                    <h3>3. Location Safety</h3>
                    <p>Because Nearo involves real-world locations, your safety is paramount:</p>
                    <ul>
                        <li>Never share your home address or sensitive locations publicly.</li>
                        <li>If you decide to meet someone from the app, do so carefully.</li>
                        <li>Always meet in well-lit, public places.</li>
                        <li>Inform friends or family before meeting someone new.</li>
                        <li>Respect the privacy of other users. Never misuse location features to track others.</li>
                    </ul>

                    <h3>4. Messaging & Calling</h3>
                    <p>Our communication features are designed for connection, not abuse. You must not:</p>
                    <ul>
                        <li>Send abusive messages or threats.</li>
                        <li>Send explicit content without explicit consent.</li>
                        <li>Send spam or repeated unwanted messages.</li>
                        <li>Attempt to contact users who have blocked you.</li>
                        <li>Record voice or video calls without permission where prohibited by law.</li>
                    </ul>

                    <h3>5. Profile Rules</h3>
                    <p>Your profile represents you in the community. It must not contain:</p>
                    <ul>
                        <li>Fake names intended to deceive or impersonate.</li>
                        <li>Offensive or highly inappropriate usernames.</li>
                        <li>Hate symbols or extremist imagery.</li>
                        <li>Adult, violent, or illegal images.</li>
                        <li>Content that infringes on the copyright of others.</li>
                    </ul>

                    <h3>6. Reporting</h3>
                    <p>We rely on you to help keep Nearo safe. You can and should report:</p>
                    <ul>
                        <li>Profiles that violate our rules.</li>
                        <li>Inappropriate or abusive chats.</li>
                        <li>Offensive photos or behavior.</li>
                    </ul>

                    <h3>7. Blocking</h3>
                    <p>You have total control over who interacts with you. You can block anyone at any time. Blocked users cannot contact you or see your location. All abuse reports generated alongside blocks are reviewed by our safety team.</p>

                    <h3>8. Consequences</h3>
                    <p>If you violate these guidelines, we may take one or more of the following actions:</p>
                    <ul>
                        <li>Issue a formal warning.</li>
                        <li>Temporarily suspend your account.</li>
                        <li>Permanently suspend and ban your account.</li>
                        <li>Remove your violating content.</li>
                        <li>Delete your account data.</li>
                        <li>Report severe violations to law enforcement when legally required.</li>
                    </ul>

                    <h3>9. Child Safety</h3>
                    <p><strong>Nearo has absolutely zero tolerance for child exploitation.</strong> Any content, behavior, or grooming related to minors will result in an immediate, permanent ban and reporting to relevant authorities (such as NCMEC or local equivalents). Please report any suspected violations immediately.</p>

                    <h3>10. Privacy</h3>
                    <p>Respect the privacy of everyone on the platform. Do not share another person's personal information (doxxing) without their explicit permission. Do not attempt to track, stalk, or maliciously expose other users.</p>

                    <h3>11. Updates</h3>
                    <p>We may update these Community Guidelines periodically to address new safety concerns. Continued use of Nearo indicates your acceptance of the latest version of these guidelines.</p>
                </div>
            )
        },
        'refunds': {
            title: 'Refund Policy',
            content: (
                <div className="legal-text-block">
                    <p className="intro"><strong>Effective Date:</strong> July 2026</p>

                    <h3>1. Overview</h3>
                    <p>Nearo offers optional Premium Subscriptions that unlock additional features such as profile customizations, badges, and advanced insights. This Refund Policy applies exclusively to purchases made for Nearo Premium Subscriptions.</p>

                    <h3>2. Subscription Purchases</h3>
                    <p>When you purchase a Premium Subscription:</p>
                    <ul>
                        <li>Your subscription benefits become available immediately after successful payment processing.</li>
                        <li>Subscriptions are billed on a recurring basis (e.g., monthly or annually) depending on the plan you select.</li>
                        <li>Your subscription will automatically renew unless canceled at least 24 hours before the end of the current billing period.</li>
                    </ul>

                    <h3>3. Refund Eligibility</h3>
                    <p>You may be eligible for a refund under the following circumstances:</p>
                    <ul>
                        <li><strong>Duplicate Payment:</strong> You were charged multiple times for the same subscription period in error.</li>
                        <li><strong>Technical Failure:</strong> Your payment was processed successfully, but the Premium Subscription was not activated on your account due to a verified technical issue on our end.</li>
                        <li><strong>Unauthorized Transactions:</strong> A transaction was made fraudulently or without your authorization (subject to investigation).</li>
                    </ul>
                    <p>Please note that simply changing your mind, forgetting to cancel before renewal, or not using the premium features does not qualify you for a refund, unless mandated by applicable consumer protection laws or the specific policies of the payment platform (Apple App Store or Google Play).</p>

                    <h3>4. Non-Refundable Situations</h3>
                    <p>In general, we do not grant refunds for:</p>
                    <ul>
                        <li>Partial use of a subscription (e.g., canceling halfway through a month).</li>
                        <li>Accidental purchases after the confirmation screen.</li>
                        <li>Accounts that have been suspended or terminated due to a violation of our Terms of Service or Community Guidelines.</li>
                    </ul>

                    <h3>5. How to Request a Refund</h3>
                    <p>Because Nearo Premium Subscriptions are processed directly through your device's App Store, we do not have the ability to issue refunds directly from our systems. To request a refund:</p>
                    <ul>
                        <li><strong>Apple (iOS):</strong> Go to reportaproblem.apple.com, sign in with your Apple ID, select "I'd like to request a refund," and choose your reason. Apple handles all iOS refund decisions.</li>
                        <li><strong>Google Play (Android):</strong> Go to play.google.com, click on your profile, go to "Payments & subscriptions," select your order history, and choose "Request a refund." Google handles all Android refund decisions.</li>
                    </ul>

                    <h3>6. App Store Limitations</h3>
                    <p>We are strictly bound by the billing policies of Apple and Google. Nearo cannot bypass, override, or manually process refunds for transactions managed by these third-party platforms. Their decisions on refund eligibility are final.</p>

                    <h3>7. Changes to this Policy</h3>
                    <p>We reserve the right to modify this Refund Policy at any time. Any changes will be posted on this page and will apply to future purchases.</p>

                    <h3>8. Contact Us</h3>
                    <p>If you experience a technical issue with your Premium Subscription activation, please contact our support team at <strong>nearoprivacy@gmail.com</strong> before requesting a refund through the App Store, as we may be able to resolve the issue directly by manually applying the premium status to your account.</p>
                </div>
            )
        }
    };

    const data = contentMap[section] || { title: 'Legal', content: <p>Content not found.</p> };

    return (
        <div className="legal-page" style={{ 
            minHeight: '100vh', 
            background: 'var(--bg-color, #f5f5f7)', 
            color: 'var(--text-color, #000)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
        }}>
            {/* Header */}
            <div className="glass-header" style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                background: 'rgba(250, 248, 245, 0.85)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                padding: '16px 20px',
                borderBottom: '0.5px solid rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
            }}>
                <button 
                    onClick={() => navigate(-1)} 
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'inherit' }}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                </button>
                <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>{data.title}</h1>
            </div>

            {/* Content */}
            <div className="legal-content" style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', lineHeight: '1.6' }}>
                <div style={{ background: 'var(--bg-card, #fff)', padding: '24px', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                    {data.content}
                </div>
            </div>

            <style>{`
                h3 { margin-top: 24px; margin-bottom: 12px; font-size: 1.1rem; }
                p { margin-bottom: 16px; color: var(--text-secondary, #555); }
                ul { margin-bottom: 16px; padding-left: 20px; color: var(--text-secondary, #555); }
                li { margin-bottom: 8px; }

                /* Dark Mode Support */
                /* Dark Mode Support via data-theme attribute */
                html[data-theme="dark"] .legal-page {
                    background: #000 !important;
                    color: #fff !important;
                }
                html[data-theme="dark"] .glass-header {
                    background: rgba(20, 20, 25, 0.85) !important;
                    border-bottom-color: rgba(255,255,255,0.15) !important;
                }
                html[data-theme="dark"] .glass-header h1,
                html[data-theme="dark"] .glass-header button {
                    color: #fff !important;
                }
                html[data-theme="dark"] .legal-content > div {
                    background: #1c1c1e !important;
                    box-shadow: none !important;
                }
                html[data-theme="dark"] h3 { color: #fff !important; }
                html[data-theme="dark"] p, html[data-theme="dark"] ul { color: #ccc !important; }
            `}</style>
        </div>
    );
}
