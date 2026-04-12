require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/bride';

mongoose.connect(MONGO_URI)
  .then(async () => {
    let admin = await User.findOne({ email: 'admin@b-ride.com' });
    if (!admin) {
        const hashedPassword = await bcrypt.hash('Luisang1', 10);
        admin = await User.create({
            name: 'Admin Global',
            email: 'admin@b-ride.com',
            password: hashedPassword,
            role: 'ADMIN',
            phoneNumber: '+52 55 5555 5555'
        });
        console.log('✅ Admin creado: admin@b-ride.com / Luisang1');
    } else {
        const hashedPassword = await bcrypt.hash('Luisang1', 10);
        admin.password = hashedPassword;
        admin.role = 'ADMIN';
        await admin.save();
        console.log('✅ Admin existente actualizado: admin@b-ride.com / Luisang1');
    }
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
