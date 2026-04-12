/**
 * B-Ride — Elevar usuario a rol ADMIN
 * Uso: npm run elevate-admin --email=12345@gmail.com
 *   o: node scripts/elevateRole.js 12345@gmail.com
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../src/models/User');

const email = process.argv[2] || process.env.ADMIN_PROMOTE_EMAIL;

if (!email) {
    console.error('[Error] Debes proporcionar un email. Uso: node scripts/elevateRole.js <email>');
    process.exit(1);
}

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('[Error] MONGODB_URI no está definido en .env');
    process.exit(1);
}

const run = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('[Seed] Conectado a MongoDB.');

        const user = await User.findOne({ email: email.toLowerCase().trim() });

        if (!user) {
            console.error(`[Error] No se encontró ningún usuario con el email: ${email}`);
            process.exit(1);
        }

        const previousRole = user.role;
        user.role = 'ADMIN';
        user.isEmailVerified = true;
        user.emailVerified = true;
        await user.save();

        console.log(`[OK] Usuario "${user.name}" (${user.email}) elevado de ${previousRole} → ADMIN`);
        process.exit(0);
    } catch (error) {
        console.error('[Seed Error]', error.message);
        process.exit(1);
    }
};

run();
