const admin = require('firebase-admin');
const path = require('path');

// Correct path assuming 'config' is a sibling to 'services' under 'server'
const serviceAccountPath = path.join(__dirname, '..', 'config', 'serviceAccountKey.json');

let firebaseAdminInitialized = false;

function initializeFirebaseAdmin() {
  if (firebaseAdminInitialized) {
    console.log('Firebase Admin SDK already initialized.');
    return;
  }
  try {
    console.log(`Attempting to initialize Firebase Admin SDK with service account: ${serviceAccountPath}`);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath),
      // databaseURL: "https://<YOUR_PROJECT_ID>.firebaseio.com" // Optional: if using Realtime Database
    });
    firebaseAdminInitialized = true;
    console.log('Firebase Admin SDK initialized successfully.');
    // Attempt to access Firestore to confirm it's available
    try {
      admin.firestore(); // This doesn't return the instance here, just checks availability
      console.log('Firestore service is available via admin.firestore()');
    } catch (e) {
      console.error('Error accessing Firestore service after admin initialization:', e);
    }
  } catch (error) {
    console.error('CRITICAL: Error initializing Firebase Admin SDK:');
    console.error('Detailed error:', error);
    console.error('Ensure that the service account file exists at the specified path:');
    console.error(serviceAccountPath);
    console.error('Also ensure the file content is a valid Firebase service account JSON.');
  }
}

module.exports = { initializeFirebaseAdmin, admin };
