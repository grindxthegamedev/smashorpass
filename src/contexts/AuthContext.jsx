import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../firebase'; // Your Firebase auth instance
import { onAuthStateChanged } from 'firebase/auth';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log(`AuthContext: onAuthStateChanged event. User UID: ${user ? user.uid : null}. Current context loading state: ${loading}`);
      setCurrentUser(user);
      setLoading(false);
      // Note: Logging currentUser & loading immediately after setState might show stale values due to closure.
      // The effect in ProfilePage or App will show the updated context values.
      console.log(`AuthContext: setState called. User set to: ${user ? user.uid : null}, loading set to false.`);
    });

    return unsubscribe; // Cleanup subscription on unmount
  }, []); // Dependencies should be empty to run only once and not on loading/currentUser change by this effect itself

  const value = {
    currentUser,
    loading,
    // You can add more auth-related functions here if needed
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
