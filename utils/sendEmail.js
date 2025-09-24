const sgMail = require('@sendgrid/mail');

// Set SendGrid API key
sgMail.setApiKey(process.env.SENDGRIDAPIKEY);

const sendEmail = async (to, subject, text) => {
  try {
    // Validate required environment variables
    if (!process.env.SENDGRIDAPIKEY) {
      console.error('❌ [Email] SENDGRIDAPIKEY environment variable not set');
      throw new Error('SendGrid API key not configured');
    }

    if (!process.env.SENDGRID_FROM_EMAIL) {
      console.error('❌ [Email] SENDGRID_FROM_EMAIL environment variable not set');
    }

    // Use the authenticated domain from the SendGrid account
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@moneymindsportal.com';
    
    // Validate email address
    if (!to || !to.includes('@')) {
      console.error('❌ [Email] Invalid recipient email address:', to);
      throw new Error('Invalid recipient email address');
    }
    
    // Convert plain text to HTML format
    const html = text.replace(/\n/g, '<br>');
    
    const msg = {
      to,
      from: fromEmail,
      subject,
      text, // Keep plain text as fallback
      html, // Add HTML version
    };
    
    console.log(`📧 [Email] Attempting to send email from ${fromEmail} to ${to} with subject: "${subject}"`);
    
    const response = await sgMail.send(msg);
    console.log(`✅ [Email] Email sent successfully to ${to}. SendGrid response status:`, response[0]?.statusCode);
    
    return response;
  } catch (error) {
    console.error(`❌ [Email] SendGrid email error for ${to}:`, error.message);
    
    if (error.response) {
      console.error('❌ [Email] SendGrid error response:', error.response.body);
      console.error('❌ [Email] SendGrid error status:', error.response.status);
    }
    
    // Log additional error details for debugging
    if (error.code) {
      console.error('❌ [Email] SendGrid error code:', error.code);
    }
    
    throw error;
  }
};

module.exports = sendEmail;