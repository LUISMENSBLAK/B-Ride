const { Resend } = require('resend');

const getEmailTemplate = (title, body) => `
    <div style="background-color: #0D0520; padding: 40px; font-family: sans-serif; color: #FFFFFF; text-align: center;">
        <h1 style="color: #F5C518; margin-bottom: 20px; font-size: 32px;">B-Ride</h1>
        ${title ? `<h2 style="color: #FFFFFF; margin-bottom: 20px; font-size: 24px;">${title}</h2>` : ''}
        <div style="font-size: 16px; margin-bottom: 30px;">
            ${body}
        </div>
        <hr style="border: none; border-top: 1px solid #3D2478; margin-top: 40px; margin-bottom: 20px;" />
        <footer style="font-size: 12px; color: #A89BC2;">
            B-Ride — Nayarit, México<br/>
            © ${new Date().getFullYear()} Todos los derechos reservados.
        </footer>
    </div>
`;

const sendEmail = async (options) => {
    const resend = new Resend(process.env.RESEND_API_KEY);

    try {
        let finalHtml = options.html;
        
        if (!finalHtml) {
            let bodyContent = `<p>${options.message || ''}</p>`;
            if (options.code) {
                bodyContent += `<div style="font-size: 48px; font-weight: bold; color: #F5C518; letter-spacing: 4px; margin: 30px 0;">${options.code}</div>`;
            }
            finalHtml = getEmailTemplate(options.subject, bodyContent);
        }

        const { data, error } = await resend.emails.send({
            from: `${process.env.FROM_NAME || 'B-Ride'} <${process.env.FROM_EMAIL || 'onboarding@resend.dev'}>`,
            to: options.email,
            subject: options.subject,
            html: finalHtml
        });

        if (error) {
            console.error('[Resend Error]', error);
            throw new Error('Error sending email');
        }
    } catch (error) {
        console.error('[sendEmail Error]', error);
        throw error;
    }
};

sendEmail.getEmailTemplate = getEmailTemplate;
module.exports = sendEmail;
