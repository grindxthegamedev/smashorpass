import React, { useRef, useEffect, useCallback, useState } from 'react';
import { doc, setDoc, increment, serverTimestamp } from 'firebase/firestore';
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import { useFirebaseFirestore } from '../contexts/FirebaseFirestoreContext';

function App() {
  const { currentUser } = useFirebaseAuth();
  const { db } = useFirebaseFirestore();

  // === New personalization metrics ===
  const viewStartRef = useRef(Date.now());
  const [sessionSwipeCount, setSessionSwipeCount] = useState(0);
  const [lastActionType, setLastActionType] = useState(null);
  const [actionStreakCount, setActionStreakCount] = useState(0);

  // Reset view timer whenever a new card is shown
  useEffect(() => {
    if (currentCard) viewStartRef.current = Date.now();
  }, [currentCard]);

  const handleAction = useCallback(async (actionType) => {
    if (!currentCard) return;

    // Compute new metrics on every swipe/favorite
    const now = Date.now();
    const viewTime = Math.min(now - viewStartRef.current, 30000);                   // cap at 30s
    const swipeSpeed = viewTime > 0 ? 1 / viewTime : 0;                             // faster swipe → larger number
    const dt = new Date();
    const timeOfDay = dt.getHours();
    const dayOfWeek = dt.getDay();                                                   // 0=Sunday…6=Saturday
    const deviceType = /Mobi|Android|iPhone/.test(navigator.userAgent) 
                       ? 'mobile' : 'desktop';

    // Session‐level counters
    setSessionSwipeCount(prev => prev + 1);
    const newSessionSwipeCount = sessionSwipeCount + 1;

    // Streak logic
    const newActionStreakCount = lastActionType === actionType 
                                 ? actionStreakCount + 1 
                                 : 1;
    setLastActionType(actionType);
    setActionStreakCount(newActionStreakCount);

    console.log(`Metrics → viewTime:${viewTime}ms, swipeSpeed:${swipeSpeed}, timeOfDay:${timeOfDay}, day:${dayOfWeek}, device:${deviceType}, sessionCount:${newSessionSwipeCount}, streak:${newActionStreakCount}`);

    if (actionType === 'Favorite') {
      // ... existing Favorite logic, you may also send metrics here if desired ...
    } else if (actionType === 'Smash' || actionType === 'Pass') {
      if (currentUser) {
        try {
          // increment user counters in Firestore as before
          const userDocRef = doc(db, 'users', currentUser.uid);
          const fieldToIncrement = actionType === 'Smash' ? 'smashesCount' : 'passesCount';
          await setDoc(userDocRef, { 
            [fieldToIncrement]: increment(1),
            lastActive: serverTimestamp()
          }, { merge: true });

          // send all metrics to preferences endpoint
          if (currentCard.originalTag) {
            await fetch(`${API_BASE_URL}/users/preferences/interact`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: currentUser.uid,
                characterTag: currentCard.originalTag,
                interactionType: actionType.toLowerCase(),
                viewTime,
                swipeSpeed,
                timeOfDay,
                dayOfWeek,
                deviceType,
                sessionSwipeCount: newSessionSwipeCount,
                actionStreakCount: newActionStreakCount
              }),
            });
          }
        } catch (error) {
          console.error(`Error recording ${actionType} + metrics:`, error);
        }
      }
    }

    loadNextCard();
  }, [
    currentCard,
    currentUser,
    sessionSwipeCount,
    lastActionType,
    actionStreakCount,
    loadNextCard
  ]);

  return (
    // ... rest of the component code ...
  );
}

export default App; 