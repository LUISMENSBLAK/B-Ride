const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage({
    apiKey: process.env.VONAGE_API_KEY,
    apiSecret: process.env.VONAGE_API_SECRET
});

const sendSMS = async (to, text) => {
    try {
        const from = process.env.VONAGE_FROM || 'BRide';
        // Vonage requere que el numero esté en formato internacional pero sin +
        const formattedTo = to.replace(/\+/g, '');
        const response = await vonage.sms.send({ to: formattedTo, from, text });
        if (response.messages[0].status === "0") {
            console.log("SMS Message sent successfully to", formattedTo);
            return true;
        } else {
            console.error(`Vonage SMS failed with error: ${response.messages[0]['error-text']}`);
            return false;
        }
    } catch (e) {
        console.error('Vonage Error: ', e);
        return false;
    }
};

module.exports = sendSMS;
