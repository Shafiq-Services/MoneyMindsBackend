const sgMail = require('@sendgrid/mail');

// Set SendGrid API key
sgMail.setApiKey(process.env.SENDGRIDAPIKEY);

const sendEmail = async (to, subject, text) => {
  try {
    // Use the authenticated domain from the SendGrid account
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@moneymindsportal.com';
    
    // Convert plain text to HTML format
    const html = text.replace(/\n/g, '<br>');
    
    const msg = {
      to,
      from: fromEmail,
      subject,
      text, // Keep plain text as fallback
      html, // Add HTML version
    };
    
    console.log(`📧 Sending email from ${fromEmail} to ${to}`);
    await sgMail.send(msg);
    console.log('✅ Email sent successfully');
  } catch (error) {
    console.error('SendGrid email error:', error.message);
    
    if (error.response) {
      console.error('SendGrid error response:', error.response.body);
    }
    throw error;
  }
};

module.exports = sendEmail;