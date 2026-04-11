/**
 * LAUNCH 6: Validación de variables de entorno al iniciar el servidor.
 * Si faltan variables críticas, el servidor aborta con mensaje claro.
 */

const REQUIRED_VARS = [
  'MONGODB_URI',
  'JWT_SECRET',
  'STRIPE_SECRET_KEY',
];

const RECOMMENDED_VARS = [
  'CORS_ORIGIN',
  'STRIPE_WEBHOOK_SECRET',
  'CLOUDINARY_URL',
  'SENTRY_DSN',
];

function validateEnv() {
  const missing = REQUIRED_VARS.filter(v => !process.env[v]);
  const missingRecommended = RECOMMENDED_VARS.filter(v => !process.env[v]);

  if (missing.length > 0) {
    console.error('╔══════════════════════════════════════════════════════╗');
    console.error('║  ❌ VARIABLES DE ENTORNO FALTANTES (OBLIGATORIAS)    ║');
    console.error('╚══════════════════════════════════════════════════════╝');
    missing.forEach(v => console.error(`  → ${v}`));
    console.error('\nCrea un archivo .env con estas variables antes de iniciar.');
    console.error('Ejemplo: MONGODB_URI=mongodb://localhost:27017/bride\n');
    process.exit(1);
  }

  if (missingRecommended.length > 0) {
    console.warn('\n⚠️  Variables recomendadas no configuradas:');
    missingRecommended.forEach(v => console.warn(`  → ${v}`));
    console.warn('  La app funcionará pero con funcionalidad reducida.\n');
  }
}

module.exports = validateEnv;
