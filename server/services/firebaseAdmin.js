const admin = require('firebase-admin');
// const path = require('path'); // No longer using path.join for this

// Use a direct absolute path to the key in the container
const serviceAccountPath = '/workspace/serviceAccountKey.json';

let firebaseAdminInitialized = false;

function initializeFirebaseAdmin() {
  if (firebaseAdminInitialized || admin.apps.length > 0) {
    console.log('Firebase Admin SDK already initialized.');
    return;
  }
  try {
    console.log(`Attempting to initialize Firebase Admin SDK with service account key: ${serviceAccountPath}`);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath),
      // databaseURL can often be inferred from the service account key, 
      // but explicitly setting it is fine if needed.
      databaseURL: 'https://tidal-beacon-460522-p8.firebaseio.com' 
    });
    firebaseAdminInitialized = true;
    console.log("Firebase Admin SDK initialized successfully with service account key.");
    
    try {
      admin.firestore(); 
      console.log('Firestore service is available via admin.firestore()');
    } catch (e) {
      console.error('Error accessing Firestore service after admin initialization:', e);
    }
  } catch (error) {
    console.error("CRITICAL: Error initializing Firebase Admin SDK with service account key:", error);
    throw error; 
  }
}

module.exports = { initializeFirebaseAdmin, admin };
