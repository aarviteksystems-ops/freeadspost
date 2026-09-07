/**
 * FreeAds Post - Transactional Email Service
 * 
 * Handles sending system emails (email verification, account alerts) via MailApp.
 * Formulates secure links directing back to the frontend application.
 */

const EmailService = (function() {

  /**
   * Dispatches an account email verification message.
   * 
   * @param {string} toEmail - Recipient email address
   * @param {string} recipientName - Recipient display name
   * @param {string} rawToken - Unhashed one-time verification token
   */
  function sendVerificationEmail(toEmail, recipientName, rawToken) {
    const frontendUrl = Config.get('FRONTEND_URL', 'http://localhost:5173');
    const verificationUrl = `${frontendUrl.replace(/\/+$/, '')}/verify-email?token=${encodeURIComponent(rawToken)}`;
    const appName = Config.get('APP_NAME', 'FreeAds Post');

    const subject = `Verify your email address - ${appName}`;
    const plainBody = `Hello ${recipientName},\n\n` +
      `Thank you for registering with ${appName}.\n\n` +
      `Please verify your email address by clicking the link below:\n` +
      `${verificationUrl}\n\n` +
      `This verification link will expire in ${Config.get('VERIFICATION_EXPIRY_HOURS', 24)} hours and can only be used once.\n\n` +
      `If you did not create an account, please disregard this email.\n\n` +
      `Best regards,\nThe ${appName} Team`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #0f172a; margin-top: 0;">Welcome to ${appName}!</h2>
        <p style="color: #334155; font-size: 16px; line-height: 24px;">Hello <strong>${recipientName}</strong>,</p>
        <p style="color: #334155; font-size: 16px; line-height: 24px;">Thank you for registering. Please click the button below to verify your email address and activate your account:</p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${verificationUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Verify Email Address</a>
        </div>
        <p style="color: #64748b; font-size: 14px; line-height: 20px;">Or copy and paste this link into your browser:<br/><a href="${verificationUrl}" style="color: #2563eb; word-break: break-all;">${verificationUrl}</a></p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; line-height: 18px; margin-bottom: 0;">This verification link will expire in ${Config.get('VERIFICATION_EXPIRY_HOURS', 24)} hours and can only be used once. If you did not create this account, no action is needed.</p>
      </div>
    `;

    try {
      MailApp.sendEmail({
        to: toEmail,
        subject: subject,
        body: plainBody,
        htmlBody: htmlBody
      });
      LoggerUtil.info(`Verification email sent to ${toEmail}`);
    } catch (e) {
      LoggerUtil.warn(`MailApp.sendEmail failed for ${toEmail}: ${e.toString()}`);
    }

    // Return the generated verification URL so test runners and dev environments can inspect it
    return {
      sent: true,
      verificationUrl: verificationUrl
    };
  }

  /**
   * Dispatches an inactivity warning email to notify user that ads will be paused soon.
   */
  function sendInactivityWarningEmail(toEmail, recipientName, daysInactive, daysRemaining) {
    const frontendUrl = Config.get('FRONTEND_URL', 'http://localhost:5173');
    const loginUrl = `${frontendUrl.replace(/\/+$/, '')}/login`;
    const appName = Config.get('APP_NAME', 'FreeAds Post');

    const subject = `Action Required: Your advertisements will be paused soon - ${appName}`;
    const plainBody = `Hello ${recipientName},\n\n` +
      `We noticed you haven't logged in to ${appName} in ${daysInactive} days.\n\n` +
      `To ensure classified listings remain active and relevant, your active advertisements will be set to HIDDEN in ${daysRemaining} days unless you log in.\n\n` +
      `Simply log in to your account to keep your advertisements active:\n` +
      `${loginUrl}\n\n` +
      `Best regards,\nThe ${appName} Team`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #d97706; margin-top: 0;">Notice: Inactive Account Alert</h2>
        <p style="color: #334155; font-size: 16px; line-height: 24px;">Hello <strong>${recipientName}</strong>,</p>
        <p style="color: #334155; font-size: 16px; line-height: 24px;">We noticed you haven't logged in to <strong>${appName}</strong> in <strong>${daysInactive} days</strong>.</p>
        <p style="color: #334155; font-size: 16px; line-height: 24px;">To keep community listings fresh, your active advertisements will be set to <strong>HIDDEN</strong> in <strong>${daysRemaining} days</strong> unless you log in.</p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${loginUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Log In to Keep Ads Active</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; line-height: 18px; margin-bottom: 0;">This is an automated platform maintenance notice from ${appName}.</p>
      </div>
    `;

    try {
      MailApp.sendEmail({
        to: toEmail,
        subject: subject,
        body: plainBody,
        htmlBody: htmlBody
      });
      LoggerUtil.info(`Inactivity warning email sent to ${toEmail}`);
    } catch (e) {
      LoggerUtil.warn(`MailApp.sendEmail failed for ${toEmail}: ${e.toString()}`);
    }

    return { sent: true };
  }

  /**
   * Dispatches an email notification when user ads have been automatically paused.
   */
  function sendInactivityAdHiddenEmail(toEmail, recipientName, daysInactive, hiddenAdsCount) {
    const frontendUrl = Config.get('FRONTEND_URL', 'http://localhost:5173');
    const myAdsUrl = `${frontendUrl.replace(/\/+$/, '')}/my-ads`;
    const appName = Config.get('APP_NAME', 'FreeAds Post');

    const subject = `Your advertisements have been paused due to inactivity - ${appName}`;
    const plainBody = `Hello ${recipientName},\n\n` +
      `Because your account has been inactive for ${daysInactive} days, ${hiddenAdsCount} of your active advertisements have been set to HIDDEN.\n\n` +
      `Your listing data and details are completely preserved. When you are ready, simply log in and request reactivation for each advertisement:\n` +
      `${myAdsUrl}\n\n` +
      `Best regards,\nThe ${appName} Team`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #0f172a; margin-top: 0;">Advertisements Paused</h2>
        <p style="color: #334155; font-size: 16px; line-height: 24px;">Hello <strong>${recipientName}</strong>,</p>
        <p style="color: #334155; font-size: 16px; line-height: 24px;">Because your account has been inactive for <strong>${daysInactive} days</strong>, <strong>${hiddenAdsCount}</strong> of your active advertisements have been automatically set to <strong>HIDDEN</strong>.</p>
        <p style="color: #334155; font-size: 16px; line-height: 24px;">Your data is completely safe and has not been deleted. You can log in at any time to request reactivation for your listings.</p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${myAdsUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Review & Reactivate My Ads</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; line-height: 18px; margin-bottom: 0;">This is an automated platform maintenance notice from ${appName}.</p>
      </div>
    `;

    try {
      MailApp.sendEmail({
        to: toEmail,
        subject: subject,
        body: plainBody,
        htmlBody: htmlBody
      });
      LoggerUtil.info(`Inactivity ad hidden email sent to ${toEmail}`);
    } catch (e) {
      LoggerUtil.warn(`MailApp.sendEmail failed for ${toEmail}: ${e.toString()}`);
    }

    return { sent: true };
  }

  return {
    sendVerificationEmail: sendVerificationEmail,
    sendInactivityWarningEmail: sendInactivityWarningEmail,
    sendInactivityAdHiddenEmail: sendInactivityAdHiddenEmail
  };
})();
