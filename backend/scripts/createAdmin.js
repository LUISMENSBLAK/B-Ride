require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');

const MONGO_URI = process.env.MONGO_URI;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@brideapp.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adminSecurePassword123';

const createAdmin = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('[Seed] Conectado a MongoDB.');

        const adminExists = await User.findOne({ email: ADMIN_EMAIL });
        if (adminExists) {
            console.log('[Seed] Admin ya existe. Abortando.');
            process.exit(0);
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);

        await User.create({
            name: 'System Admin',
            email: ADMIN_EMAIL,
            password: hashedPassword,
            role: 'ADMIN',
            isEmailVerified: true,
            emailVerified: true
        });

        console.log(`[Seed] Admin creado exitosamente. Email: ${ADMIN_EMAIL}`);
        process.exit(0);
    } catch (error) {
        console.error('[Seed Error]', error);
        process.exit(1);
    }
};

createAdmin();
