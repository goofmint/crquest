require('dotenv').config({ quiet: true });

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Path to auth credentials for the appropriate Firebase admin credentials
// should be configured as an environment variable for builds
const requiredEnvNames = ['FIREBASE_ADMIN_SA_JSON', 'FIREBASE_DATABASE_URL'];
const missingEnvNames = requiredEnvNames.filter(name => !process.env[name]);

if (missingEnvNames.length > 0) {
  throw new Error(
    `Firebase configuration is required. Missing environment variables: ${missingEnvNames.join(
      ', '
    )}. Check .env.template for more info.`
  );
}

const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SA_JSON);
const databaseURL = process.env.FIREBASE_DATABASE_URL;

// Initialize Firebase admin SDK
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL,
});

// Get handle to the relevant Firebase service
const db = getFirestore(app);

module.exports = {
  db,
};
