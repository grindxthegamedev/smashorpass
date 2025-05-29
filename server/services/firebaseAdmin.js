const admin = require('firebase-admin');
// const path = require('path'); // No longer needed for serviceAccountPath

// Correct path assuming 'config' is a sibling to 'services' under 'server'
// const serviceAccountPath = path.join(__dirname, '..', 'config', 'serviceAccountKey.json'); // No longer directly using serviceAccountPath here

let firebaseAdminInitialized = false;

function initializeFirebaseAdmin() {
  if (firebaseAdminInitialized || admin.apps.length > 0) { // Check admin.apps.length too
    console.log('Firebase Admin SDK already initialized.');
    return;
  }
  try {
    console.log('Attempting to initialize Firebase Admin SDK using Application Default Credentials...');
    admin.initializeApp(); // Initialize without specific credentials
                           // On Cloud Run, this uses the service's assigned service account.
                           // Locally, it uses credentials from `gcloud auth application-default login` or GOOGLE_APPLICATION_CREDENTIALS env var.

    firebaseAdminInitialized = true;
    console.log('Firebase Admin SDK initialized successfully via Application Default Credentials.');
    // Attempt to access Firestore to confirm it's available
    try {
      admin.firestore(); 
      console.log('Firestore service is available via admin.firestore()');
    } catch (e) {
      console.error('Error accessing Firestore service after admin initialization:', e);
    }
  } catch (error) {
    console.error('CRITICAL: Error initializing Firebase Admin SDK:');
    console.error('Detailed error:', error);
    console.error('Ensure your Cloud Run service has appropriate IAM permissions for Firebase, or locally, ensure Application Default Credentials are set up.');
  }
}

module.exports = { initializeFirebaseAdmin, admin };
