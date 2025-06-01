const express = require('express');
const { admin } = require('../services/firebaseAdmin'); // Assuming admin is exported after initialization
const { Timestamp, FieldValue } = require('firebase-admin/firestore'); // Added Timestamp and FieldValue

const userRouter = express.Router();

// Middleware to verify Firebase ID token
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: No token provided or invalid token format.' });
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken; // Add user info to request object
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(403).json({ message: 'Forbidden: Invalid or expired token.' });
  }
};

// Helper function to delete all documents in a collection or subcollection in batches.
async function deleteCollection(db, collectionPath, batchSize = 100) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, collectionPath, resolve, reject); // Pass collectionPath
  });
}

async function deleteQueryBatch(db, query, collectionPath, resolve, reject) { // Added collectionPath parameter
  try {
    const snapshot = await query.get();
    if (snapshot.size === 0) {
      return resolve();
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Recurse on the next batch
    // Check if there might be more documents by comparing snapshot size to limit
    // Note: query._query.limit is an internal detail. A more robust way is to pass batchSize or check snapshot.size === batchSize.
    // For now, assuming the limit set on the query object is accessible and correct.
    const queryLimit = query._query && query._query.limit ? query._query.limit : 100; // Fallback if internal changes
    if (snapshot.size === queryLimit) { 
      process.nextTick(() => {
        deleteQueryBatch(db, query, collectionPath, resolve, reject); // Pass collectionPath
      });
    } else {
      resolve();
    }
  } catch (err) {
    // Use the passed collectionPath for logging
    console.error(`Error deleting collection batch for path "${collectionPath}":`, err);
    reject(err);
  }
}

// POST /api/users/register
userRouter.post('/register', async (req, res) => {
  const { email, password, displayName } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: displayName || undefined, // displayName is optional
    });
    console.log('Successfully created new user:', userRecord.uid);

    // Optionally, you might want to create a corresponding user document in Firestore here
    // For example:
    // await admin.firestore().collection('users').doc(userRecord.uid).set({
    //   email: userRecord.email,
    //   displayName: userRecord.displayName,
    //   createdAt: admin.firestore.FieldValue.serverTimestamp(),
    //   // any other initial user data
    // });

    // For security, don't send back the full userRecord. Send a success message or limited info.
    res.status(201).json({ message: 'User created successfully.', uid: userRecord.uid });

  } catch (error) {
    console.error('Error creating new user:', error);
    // Provide a more user-friendly error message based on Firebase error codes if desired
    let errorMessage = 'Failed to create user.';
    if (error.code === 'auth/email-already-exists') {
      errorMessage = 'The email address is already in use by another account.';
    }
    // Add more specific error handling as needed
    res.status(500).json({ message: errorMessage, error: error.code });
  }
});

// POST /api/users/preferences/interact
userRouter.post('/preferences/interact', async (req, res) => {
  const {
    userId,
    characterTag,
    interactionType,
    viewTime,
    swipeSpeed,
    timeOfDay,
    dayOfWeek,
    deviceType,
    sessionSwipeCount,
    actionStreakCount
  } = req.body;

  if (!userId || !characterTag || !interactionType) {
    return res.status(400).json({ message: 'Missing required fields: userId, characterTag, or interactionType.' });
  }

  // Accept 'smash', 'pass', and 'favorite' interactions
  if (!['smash', 'pass', 'favorite'].includes(interactionType)) {
    return res.status(400).json({ message: 'Invalid interactionType. Must be "smash", "pass", or "favorite".' });
  }

  // Validate new metrics (basic validation, can be expanded)
  const newMetrics = {
    viewTime: typeof viewTime === 'number' ? viewTime : 0,
    swipeSpeed: typeof swipeSpeed === 'number' ? swipeSpeed : 0,
    timeOfDay: typeof timeOfDay === 'number' ? timeOfDay : -1, // -1 if undefined
    dayOfWeek: typeof dayOfWeek === 'number' ? dayOfWeek : -1, // -1 if undefined
    deviceType: typeof deviceType === 'string' ? deviceType : 'unknown',
    sessionSwipeCount: typeof sessionSwipeCount === 'number' ? sessionSwipeCount : 0,
    actionStreakCount: typeof actionStreakCount === 'number' ? actionStreakCount : 0,
  };

  // Document ID for Firestore cannot contain '/' characters. 
  // If characterTag might contain them, it needs sanitization or a different ID strategy.
  // For now, assuming characterTag is a safe ID.
  const preferenceDocRef = admin.firestore()
    .collection('users').doc(userId)
    .collection('tagPreferences').doc(characterTag);

  try {
    await admin.firestore().runTransaction(async (transaction) => {
      const prefDoc = await transaction.get(preferenceDocRef);

      let data = prefDoc.exists ? prefDoc.data() : {};

      // Initialize counts and totals if new or not present
      data.smashCount = data.smashCount || 0;
      data.passCount = data.passCount || 0;
      data.favoriteCount = data.favoriteCount || 0; // Explicitly track favorites
      data.interactionCount = data.interactionCount || 0;

      data.totalViewTime = data.totalViewTime || 0;
      data.totalSwipeSpeed = data.totalSwipeSpeed || 0; // Sum of speeds to calculate average later
      
      data.timeOfDayCounts = data.timeOfDayCounts || {};
      data.dayOfWeekCounts = data.dayOfWeekCounts || {};
      data.deviceCounts = data.deviceCounts || {};
      
      data.totalSessionSwipeValue = data.totalSessionSwipeValue || 0;
      data.totalActionStreakValue = data.totalActionStreakValue || 0;


      // Update basic interaction counts
      data.interactionCount++;
      if (interactionType === 'smash') {
        data.smashCount++;
      } else if (interactionType === 'pass') {
        data.passCount++;
      } else if (interactionType === 'favorite') {
        data.favoriteCount++;
        data.smashCount += 2; // Favorite still counts as double smash for base affinity
      }
      
      // Update new metrics
      data.totalViewTime += newMetrics.viewTime;
      data.totalSwipeSpeed += newMetrics.swipeSpeed;

      if (newMetrics.timeOfDay !== -1) {
        data.timeOfDayCounts[newMetrics.timeOfDay.toString()] = (data.timeOfDayCounts[newMetrics.timeOfDay.toString()] || 0) + 1;
      }
      if (newMetrics.dayOfWeek !== -1) {
        data.dayOfWeekCounts[newMetrics.dayOfWeek.toString()] = (data.dayOfWeekCounts[newMetrics.dayOfWeek.toString()] || 0) + 1;
      }
      data.deviceCounts[newMetrics.deviceType] = (data.deviceCounts[newMetrics.deviceType] || 0) + 1;
      
      data.totalSessionSwipeValue += newMetrics.sessionSwipeCount;
      data.totalActionStreakValue += newMetrics.actionStreakCount;

      // Calculate/Recalculate averages
      data.avgViewTime = data.interactionCount > 0 ? data.totalViewTime / data.interactionCount : 0;
      data.avgSwipeSpeed = data.interactionCount > 0 ? data.totalSwipeSpeed / data.interactionCount : 0;
      data.avgSessionSwipeCount = data.interactionCount > 0 ? data.totalSessionSwipeValue / data.interactionCount : 0;
      data.avgActionStreakCount = data.interactionCount > 0 ? data.totalActionStreakValue / data.interactionCount : 0;
      
      // Update timestamps and other info
      data.tagName = characterTag; // Store or update the tag name
      data.lastInteractedAt = Timestamp.now();
      data.lastInteractionType = interactionType;
      data.lastAffinity = (interactionType === 'pass') ? -1 : 1; // 1 for smash/favorite, -1 for pass

      // Calculate main affinity score (can be simple or complex)
      // This remains the simple version; characterRouter will use all fields for its dynamic scoring
      data.affinityScore = data.smashCount - data.passCount; 
      // Note: 'favorite' effectively gives +2 to this simple affinityScore.
      
      if (prefDoc.exists) {
        transaction.update(preferenceDocRef, data);
      } else {
        transaction.set(preferenceDocRef, data);
      }
    });

    res.status(200).json({ message: 'Preference and metrics recorded successfully.' });

  } catch (error) {
    console.error('Error recording user preference and metrics:', error);
    res.status(500).json({ message: 'Failed to record preference and metrics.', error: error.message });
  }
});

// POST /api/users/delete-account
userRouter.post('/delete-account', verifyFirebaseToken, async (req, res) => {
  const userId = req.user.uid;

  if (!userId) {
    // This should not happen if verifyFirebaseToken works correctly
    return res.status(400).json({ message: 'User ID not found in token.' });
  }

  console.log(`[UserRouter] Attempting to delete account for UID: ${userId}`);

  try {
    const db = admin.firestore();

    // 1. Delete 'tagPreferences' subcollection
    const tagPreferencesPath = `users/${userId}/tagPreferences`;
    console.log(`[UserRouter] Deleting subcollection: ${tagPreferencesPath}`);
    await deleteCollection(db, tagPreferencesPath);
    console.log(`[UserRouter] Successfully deleted subcollection: ${tagPreferencesPath}`);

    // 2. Delete 'favorites' subcollection
    const favoritesPath = `users/${userId}/favorites`;
    console.log(`[UserRouter] Deleting subcollection: ${favoritesPath}`);
    await deleteCollection(db, favoritesPath);
    console.log(`[UserRouter] Successfully deleted subcollection: ${favoritesPath}`);

    // 3. Delete the main user document
    const userDocRef = db.collection('users').doc(userId);
    console.log(`[UserRouter] Deleting user document: users/${userId}`);
    await userDocRef.delete();
    console.log(`[UserRouter] Successfully deleted user document: users/${userId}`);

    // 4. Delete Firebase Auth user
    console.log(`[UserRouter] Deleting Firebase Auth user: ${userId}`);
    await admin.auth().deleteUser(userId);
    console.log(`[UserRouter] Successfully deleted Firebase Auth user: ${userId}`);

    res.status(200).json({ message: 'Account deleted successfully.' });

  } catch (error) {
    console.error(`[UserRouter] Error deleting account for UID ${userId}:`, error);
    // Determine if the error is because parts of the data didn't exist (which is fine for deletion)
    if (error.code === 5 && error.details && error.details.includes('NOT_FOUND')) {
        // This can happen if e.g. a subcollection or the user doc was already deleted or never existed.
        // If auth user deletion also succeeded or was the source of a 'user not found', it's effectively a success.
        try {
            await admin.auth().getUser(userId); // Check if auth user still exists
            // If getUser doesn't throw, auth user still exists, so the error was Firestore-related but not critical for deletion outcome.
            console.warn(`[UserRouter] Account deletion for ${userId} encountered non-critical Firestore 'NOT_FOUND' errors, but auth user might still exist. Proceeding as if successful if auth user is gone.`);
             // If we reach here, auth user still exists, so the original error is more problematic.
             return res.status(500).json({ message: 'Failed to delete account due to server error after data inconsistencies.', error: error.message });
        } catch (authError) {
            if (authError.code === 'auth/user-not-found') {
                console.log(`[UserRouter] Auth user ${userId} confirmed not found. Considering deletion successful despite earlier Firestore 'NOT_FOUND' errors.`);
                return res.status(200).json({ message: 'Account deleted successfully (with prior non-critical data cleanup issues).' });
            }
            // Some other auth error, means the original Firestore error is more relevant.
             return res.status(500).json({ message: 'Failed to delete account due to server error and auth status uncertainty.', error: error.message });
        }
    } else if (error.code === 'auth/user-not-found') {
        console.log(`[UserRouter] Auth user ${userId} not found during deletion attempt. Assuming already deleted or never existed. Firestore data cleanup might have been partial.`);
        return res.status(200).json({ message: 'Account effectively deleted (auth user not found).' });
    }

    res.status(500).json({ message: 'Failed to delete account.', error: error.message });
  }
});

module.exports = userRouter;
