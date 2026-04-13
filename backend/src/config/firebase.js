const admin = require('firebase-admin');

// Usar variable de entorno con el JSON de la service account
// En .env: FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
// O apuntar a un archivo: FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccount.json

let app;

if (!admin.apps.length) {
  const credential = process.env.FIREBASE_SERVICE_ACCOUNT
    ? admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    : admin.credential.cert(require('../../serviceAccount.json'));

  app = admin.initializeApp({ credential });
} else {
  app = admin.apps[0];
}

module.exports = admin;
