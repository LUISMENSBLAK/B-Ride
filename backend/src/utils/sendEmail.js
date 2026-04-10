const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
    // In a real production environment, use SendGrid, Mailgun, or AWS SES
    // For this MVP, we can use ethereal email for testing or a Gmail account

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.ethereal.email',
        port: process.env.SMTP_PORT || 587,
        auth: {
            user: process.env.SMTP_EMAIL || 'test@ethereal.email',
            pass: process.env.SMTP_PASSWORD || 'password123',
        },
    });

    const message = {
        from: `${process.env.FROM_NAME || 'B-Ride Admin'} <${process.env.FROM_EMAIL || 'noreply@bride.com'}>`,
        to: options.email,
        subject: options.subject,
        text: options.message,
    };

    const info = await transporter.sendMail(message);

    console.log('Message sent: %s', info.messageId);
};

module.exports = sendEmail;
