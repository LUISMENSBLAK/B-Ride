/**
 * setPassword.js — Reset password for any B-Ride user
 * Usage: node scripts/setPassword.js <email> <newPassword>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const email    = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('\nUso: node scripts/setPassword.js <email> <contraseña>\n');
  process.exit(1);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bride');
  console.log('[DB] Conectado.');

  // Load User model
  const User = require('../src/models/User');

  const user = await User.findOne({ email });
  if (!user) {
    console.error(`[Error] No existe usuario con email: ${email}`);
    process.exit(1);
  }

  const hashed = await bcrypt.hash(password, 12);
  user.password = hashed;
  user.isVerified = true; // aseguramos que esté verificado para poder loguear
  await user.save();

  console.log(`\n✅ Contraseña actualizada correctamente para "${user.name}" (${user.email})`);
  console.log(`   Rol actual: ${user.role}\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('[Error]', err.message);
  process.exit(1);
});
