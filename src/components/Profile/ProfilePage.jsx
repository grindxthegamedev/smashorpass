import React, { useState, useEffect, useCallback } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Home, User, Star, Heart, X, ArrowLeft, Loader2, ImageOff, Settings, CheckCircle, AlertCircle, Clock, Trash2, ChevronLeft, ChevronRight, Gift } from 'lucide-react';
import { db, auth } from '../../firebase';
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential, deleteUser } from 'firebase/auth';
import { collection, query, orderBy, getDocs, doc, getDoc, updateDoc, Timestamp, writeBatch, deleteDoc } from 'firebase/firestore';
import './ProfilePage.css';
import { API_BASE_URL } from '../../App'; // Added import

// Helper function for smash profile
const getSmashProfile = (smashesCount, passesCount) => {
  const totalActions = smashesCount + passesCount;
  if (totalActions === 0) {
    return { percentage: null, tag: "Start swiping to see your stats!", ratioString: "N/A" };
  }

  const smashPercentage = Math.round((smashesCount / totalActions) * 100);
  let tag = "";

  if (smashPercentage === 0) tag = "All Pass, No Smash? Exploring the options!";
  else if (smashPercentage >= 1 && smashPercentage <= 10) tag = "Highly Selective!";
  else if (smashPercentage >= 11 && smashPercentage <= 30) tag = "Picky Tastes!";
  else if (smashPercentage >= 31 && smashPercentage <= 49) tag = "Balanced Swiper.";
  else if (smashPercentage === 50) tag = "Perfectly Balanced, as all things should be.";
  else if (smashPercentage >= 51 && smashPercentage <= 69) tag = "Enthusiastic!";
  else if (smashPercentage >= 70 && smashPercentage <= 89) tag = "Smash Happy!";
  else if (smashPercentage >= 90 && smashPercentage <= 99) tag = "A True Connoisseur!";
  else if (smashPercentage === 100) tag = "Smash Supreme! A hole is a goal, huh?";
  else tag = "Calculating..."; // Should not happen with Math.round

  return { percentage: smashPercentage, tag, ratioString: `${smashesCount} Smashes / ${passesCount} Passes` };
};

function ProfilePage() {
  const { currentUser, loading: authContextLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [favorites, setFavorites] = useState([]);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false);
  const [userStats, setUserStats] = useState({ smashesCount: 0, passesCount: 0 });
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Gallery State
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [currentGalleryIndex, setCurrentGalleryIndex] = useState(0);

  // State for Change Username
  const [newDisplayName, setNewDisplayName] = useState('');
  const [usernameStatus, setUsernameStatus] = useState({ message: '', type: '' });
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [lastUsernameChangeTime, setLastUsernameChangeTime] = useState(null);

  // State for Change Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState({ message: '', type: '' });
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [lastPasswordChangeTime, setLastPasswordChangeTime] = useState(null);

  const [isLoadingTimestamps, setIsLoadingTimestamps] = useState(true);

  // State for Reset All Data
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetCurrentPassword, setResetCurrentPassword] = useState('');
  const [isResettingData, setIsResettingData] = useState(false);
  const [resetDataStatus, setResetDataStatus] = useState({ message: '', type: '' });
  const [lastDataResetTime, setLastDataResetTime] = useState(null);

  // State for Delete Account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteCurrentPassword, setDeleteCurrentPassword] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountStatus, setDeleteAccountStatus] = useState({ message: '', type: '' });

  // Helper function to check if an action can be performed (24-hour cooldown)
  const canPerformAction = (lastActionTime) => {
    if (!lastActionTime) return { allowed: true, timeLeft: null };
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const timeSinceLastAction = new Date().getTime() - lastActionTime.getTime();
    if (timeSinceLastAction < twentyFourHours) {
      const timeLeftMs = twentyFourHours - timeSinceLastAction;
      const hoursLeft = Math.floor(timeLeftMs / (1000 * 60 * 60));
      const minutesLeft = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));
      return { allowed: false, timeLeft: `${hoursLeft}h ${minutesLeft}m` };
    }
    return { allowed: true, timeLeft: null };
  };

  const usernameChangePolicy = canPerformAction(lastUsernameChangeTime);
  const passwordChangePolicy = canPerformAction(lastPasswordChangeTime);
  const dataResetPolicy = canPerformAction(lastDataResetTime);

  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserDocumentData = async () => {
      if (currentUser) {
        setIsLoadingTimestamps(true);
        const userDocRef = doc(db, 'users', currentUser.uid);
        try {
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setNewDisplayName(currentUser.displayName || '');
            if (data.lastUsernameChangeAt) {
              setLastUsernameChangeTime(data.lastUsernameChangeAt.toDate());
            }
            if (data.lastPasswordChangeAt) {
              setLastPasswordChangeTime(data.lastPasswordChangeAt.toDate());
            }
            if (data.lastDataResetAt) {
              setLastDataResetTime(data.lastDataResetAt.toDate());
            }
          } else {
            setNewDisplayName(currentUser.displayName || '');
          }
        } catch (error) {
          console.error("Error fetching user document for timestamps:", error);
          setNewDisplayName(currentUser.displayName || '');
        }
        setIsLoadingTimestamps(false);
      }
    };

    fetchUserDocumentData();
    const fetchFavorites = async () => {
      if (currentUser && activeTab === 'favorites') {
        console.log('Fetching favorites for user:', currentUser.uid);
        setIsLoadingFavorites(true);
        try {
          const favoritesColRef = collection(db, `users/${currentUser.uid}/favorites`);
          const q = query(favoritesColRef, orderBy('favoritedAt', 'desc')); 
          const querySnapshot = await getDocs(q);
          const userFavorites = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setFavorites(userFavorites);
          console.log('Fetched favorites:', userFavorites);
        } catch (error) {
          console.error('Error fetching favorites:', error);
          setFavorites([]); 
        }
        setIsLoadingFavorites(false);
      }
    };

    const fetchUserStats = async () => {
      if (currentUser) {
        console.log('Fetching stats for user:', currentUser.uid);
        setIsLoadingStats(true);
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserStats({
              smashesCount: data.smashesCount || 0,
              passesCount: data.passesCount || 0,
            });
            console.log('Fetched user stats:', data);
          } else {
            console.log('No user document found for stats, defaulting to 0.');
            setUserStats({ smashesCount: 0, passesCount: 0 });
          }
        } catch (error) {
          console.error('Error fetching user stats:', error);
          setUserStats({ smashesCount: 0, passesCount: 0 });
        }
        setIsLoadingStats(false);
      }
    };

    fetchFavorites();
    fetchUserStats(); 
  }, [currentUser, activeTab]); 

  const openGallery = (index) => {
    setCurrentGalleryIndex(index);
    setIsGalleryOpen(true);
  };

  const closeGallery = () => {
    setIsGalleryOpen(false);
  };

  const showNextImage = useCallback(() => {
    setCurrentGalleryIndex((prevIndex) => (prevIndex + 1) % favorites.length);
  }, [favorites.length]);

  const showPrevImage = useCallback(() => {
    setCurrentGalleryIndex((prevIndex) => (prevIndex - 1 + favorites.length) % favorites.length);
  }, [favorites.length]);

  useEffect(() => {
    if (!isGalleryOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === 'ArrowRight') {
        showNextImage();
      } else if (event.key === 'ArrowLeft') {
        showPrevImage();
      } else if (event.key === 'Escape') {
        closeGallery();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isGalleryOpen, showNextImage, showPrevImage, closeGallery]);

  // Calculate smash profile
  const smashProfile = React.useMemo(() => {
    if (isLoadingStats) return { percentage: null, tag: "Loading stats...", ratioString: "Loading..." };
    return getSmashProfile(userStats.smashesCount, userStats.passesCount);
  }, [userStats.smashesCount, userStats.passesCount, isLoadingStats]);

  if (authContextLoading) {
    console.log('ProfilePage: AuthContext is loading. Rendering loading spinner.');
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mr-3"></div>
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    console.log('ProfilePage: AuthContext loaded, but no currentUser. Redirecting to /.');
    return <Navigate to="/" replace />;
  }

  console.log('ProfilePage: AuthContext loaded, currentUser exists. Rendering profile content for UID:', currentUser.uid);

  // Handler for Username Change
  const handleChangeUsername = async (e) => {
    e.preventDefault();
    if (!currentUser || isLoadingTimestamps) return;

    const policy = canPerformAction(lastUsernameChangeTime);
    if (!policy.allowed) {
      setUsernameStatus({ message: `You can change your username again in ${policy.timeLeft}.`, type: 'error' });
      return;
    }

    if (newDisplayName.trim() === currentUser.displayName) {
      setUsernameStatus({ message: 'New username is the same as current.', type: 'error' });
      return;
    }
    if (newDisplayName.trim().length < 3) {
        setUsernameStatus({ message: 'Username must be at least 3 characters.', type: 'error' });
        return;
    }

    setIsUpdatingUsername(true);
    setUsernameStatus({ message: '', type: '' });
    try {
      await updateProfile(currentUser, { displayName: newDisplayName.trim() });
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, { lastUsernameChangeAt: Timestamp.now() });
      setLastUsernameChangeTime(new Date()); 
      setUsernameStatus({ message: 'Username updated successfully!', type: 'success' });
    } catch (error) {
      console.error('Error updating username:', error);
      setUsernameStatus({ message: error.message || 'Failed to update username.', type: 'error' });
    }
    setIsUpdatingUsername(false);
  };

  // Handler for Password Change
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentUser || !currentUser.email || isLoadingTimestamps) return;

    const policy = canPerformAction(lastPasswordChangeTime);
    if (!policy.allowed) {
      setPasswordStatus({ message: `You can change your password again in ${policy.timeLeft}.`, type: 'error' });
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setPasswordStatus({ message: 'New password must be at least 6 characters.', type: 'error' });
      return;
    }

    setIsUpdatingPassword(true);
    setPasswordStatus({ message: '', type: '' });

    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, { lastPasswordChangeAt: Timestamp.now() });
      setLastPasswordChangeTime(new Date()); 
      setPasswordStatus({ message: 'Password updated successfully! Please log in again if you encounter issues.', type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (error) {
      console.error('Error updating password:', error);
      let errorMessage = 'Failed to update password.';
      if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect current password.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'New password is too weak.';
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = 'This operation is sensitive and requires recent authentication. Please log out and log back in before trying again.';
      }
      setPasswordStatus({ message: errorMessage, type: 'error' });
    }
    setIsUpdatingPassword(false);
  };

  // Handler to show Reset Data confirmation
  const handleRequestResetData = () => {
    setResetDataStatus({ message: '', type: '' }); 
    setResetCurrentPassword('');

    const policy = canPerformAction(lastDataResetTime);
    if (!policy.allowed) {
      setResetDataStatus({ message: `You can reset your data again in ${policy.timeLeft}.`, type: 'error' });
      setShowResetConfirm(false); 
      return;
    }
    setShowResetConfirm(true);
  };

  // Handler for Confirming Reset All Data
  const handleConfirmResetAllData = async (e) => {
    e.preventDefault();
    if (!currentUser || !currentUser.email || isLoadingTimestamps) return;

    const policy = canPerformAction(lastDataResetTime);
    if (!policy.allowed) {
      setResetDataStatus({ message: `You can reset your data again in ${policy.timeLeft}.`, type: 'error' });
      return;
    }

    if (!resetCurrentPassword) {
      setResetDataStatus({ message: 'Please enter your current password to confirm.', type: 'error' });
      return;
    }

    setIsResettingData(true);
    setResetDataStatus({ message: '', type: '' });

    try {
      // 1. Re-authenticate user
      const credential = EmailAuthProvider.credential(currentUser.email, resetCurrentPassword);
      await reauthenticateWithCredential(currentUser, credential);

      // 2. Delete data from Firestore
      const batch = writeBatch(db);
      const userDocRef = doc(db, 'users', currentUser.uid);

      // Delete favorites subcollection
      const favoritesColRef = collection(db, `users/${currentUser.uid}/favorites`);
      const favoritesSnapshot = await getDocs(favoritesColRef);
      favoritesSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // TODO: Add deletion for 'smashes' and 'passes' subcollections if they exist and store detailed records
      // For now, we assume counts are the primary store for these.

      // Update main user document (reset counts)
      batch.update(userDocRef, {
        smashesCount: 0,
        passesCount: 0,
        lastDataResetAt: Timestamp.now(), 
      });

      await batch.commit();

      // 3. Update local state
      setUserStats({ smashesCount: 0, passesCount: 0 });
      setFavorites([]); 
      setLastDataResetTime(new Date()); 

      setResetDataStatus({ message: 'All your data (smashes, passes, favorites) has been reset successfully.', type: 'success' });
      setShowResetConfirm(false);
      setResetCurrentPassword('');

    } catch (error) {
      console.error('Error resetting data:', error);
      let errorMessage = 'Failed to reset data.';
      if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect current password. Data not reset.';
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = 'This operation is sensitive and requires recent authentication. Please log out, log back in, and try again.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
      }
      setResetDataStatus({ message: errorMessage, type: 'error' });
    }
    setIsResettingData(false);
  };

  // Handler to show Delete Account confirmation
  const handleRequestDeleteAccount = () => {
    setDeleteAccountStatus({ message: '', type: '' });
    setDeleteCurrentPassword('');
    setShowDeleteConfirm(true);
  };

  // Handler for Confirming Delete Account
  const handleConfirmDeleteAccount = async (e) => {
    e.preventDefault();
    if (!currentUser || !currentUser.email) return;
    if (!deleteCurrentPassword) {
      setDeleteAccountStatus({ message: 'Please enter your current password to confirm.', type: 'error' });
      return;
    }

    setIsDeletingAccount(true);
    setDeleteAccountStatus({ message: '', type: '' });
    let responseData = null;

    try {
      // 1. Re-authenticate user
      const credential = EmailAuthProvider.credential(currentUser.email, deleteCurrentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      console.log('[ProfilePage] User re-authenticated successfully.');

      // 2. Get ID token
      const idToken = await currentUser.getIdToken();

      // 3. Call backend to delete account data and auth user
      const response = await fetch(`${API_BASE_URL}/users/delete-account`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json' // Though no body is sent, good practice
        },
      });

      responseData = await response.json();

      if (!response.ok) {
        // Throw an error that will be caught by the catch block
        // Use message from backend if available, otherwise a generic one
        const error = new Error(responseData.message || `Server error: ${response.status}`);
        error.code = responseData.error || response.status; // Store original code if available
        throw error;
      }

      // 4. Handle successful deletion (e.g., navigate away)
      // AuthContext should pick up the user deletion and handle global state via onAuthStateChanged.
      console.log('[ProfilePage] Account deletion initiated successfully via backend. Navigating to home.');
      // Clear any local state related to deletion status as we are navigating
      setDeleteAccountStatus({ message: 'Account deleted successfully. You will be logged out.', type: 'success' });
      // Delay navigation slightly to allow user to see success message, then rely on AuthContext to redirect
      setTimeout(() => {
        // navigate('/'); // Auth listener should handle redirect on sign-out
        // Forcing a sign out on client can also trigger auth listener if backend deletion is slow to propagate event
        // However, the backend deleting the auth user is the primary trigger for onAuthStateChanged.
        // If onAuthStateChanged doesn't fire quickly, user might be stuck. A manual signOut can help here.
        // await signOut(auth); // This might not be necessary if backend deletion triggers onAuthStateChanged promptly.
      }, 3000); // 3 seconds to show message
      // No explicit navigation here anymore, relying on AuthContext to update UI upon user deletion

    } catch (error) {
      console.error('Error during account deletion process:', error);
      let errorMessage = 'Failed to delete account.';
      if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect current password. Account not deleted.';
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = 'This operation is sensitive and requires recent authentication. Please log out, log back in, and try again.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed re-authentication attempts. Please try again later.';
      } else if (responseData && responseData.message) { 
        errorMessage = responseData.message;
      } else if (error.message && error.message.startsWith('Server error:')) {
        errorMessage = error.message; // Use server error message directly
      } else if (error.message) {
        errorMessage = error.message; // Use error message from backend if thrown
      }
      setDeleteAccountStatus({ message: errorMessage, type: 'error' });
      setIsDeletingAccount(false); 
    }
  };

  return (
    <div className="min-h-screen lustful-bg text-white p-4 max-w-4xl mx-auto">
      {/* Back to Home Link */}
      <Link to="/" className="inline-flex items-center text-pink-400 hover:text-pink-300 mb-6 transition-colors">
        <ArrowLeft size={20} className="mr-1" />
        <span>Back to Swiping</span>
      </Link>
      
      <div className="bg-gray-900/80 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden border border-pink-500/30">
        {/* Profile Header */}
        <div className="p-6 bg-gradient-to-r from-pink-500 to-purple-600 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20">
            {[...Array(20)].map((_, i) => (
              <Heart 
                key={i} 
                size={20 + Math.random() * 30} 
                className="absolute text-white" 
                style={{
                  top: `${Math.random() * 100}%`,
                  left: `${Math.random() * 100}%`,
                  opacity: 0.1 + Math.random() * 0.3,
                  transform: `rotate(${Math.random() * 360}deg)`
                }}
              />
            ))}
          </div>
          <div className="flex flex-col md:flex-row items-center">
            {/* User Avatar (Optional) - Placeholder for now */}
            <div className="w-24 h-24 bg-pink-900/50 backdrop-blur-sm rounded-full flex items-center justify-center text-4xl text-white mb-4 md:mb-0 md:mr-6 border-2 border-pink-400/50 shadow-lg shadow-pink-500/30">
              {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : <User size={48} />}
            </div>
            
            {/* User Info & Stats */}
            <div className="text-center md:text-left">
              <h1 className="text-3xl font-bold text-white">{currentUser.displayName || currentUser.email || 'User Profile'}</h1>
              {currentUser.email && <p className="text-sm text-gray-300 mb-3">{currentUser.email}</p>}
              
              {/* Smash Stats Display */}
              <div className="mt-2 p-3 bg-purple-900/50 backdrop-blur-sm rounded-lg shadow-md inline-block border border-pink-500/30">
                <h3 className="text-md font-semibold text-pink-200">Swiping Stats</h3>
                {isLoadingStats ? (
                  <p className="text-gray-300 text-sm">Loading stats...</p>
                ) : (
                  <>
                    <p className="text-xl font-bold text-white">
                      {smashProfile.percentage !== null ? `${smashProfile.percentage}% Smashes` : "N/A"}
                    </p>
                    <p className="text-xs text-gray-300 italic">{smashProfile.tag}</p>
                    <p className="text-xs text-gray-400 mt-1">({smashProfile.ratioString})</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex border-b border-pink-800/50">
          <button 
            onClick={() => setActiveTab('profile')} 
            className={`px-4 py-3 flex items-center ${activeTab === 'profile' ? 'text-pink-400 border-b-2 border-pink-400' : 'text-gray-400 hover:text-pink-200'}`}
          >
            <User size={18} className="mr-2" />
            Profile
          </button>
          <button 
            onClick={() => setActiveTab('favorites')} 
            className={`px-4 py-3 flex items-center ${activeTab === 'favorites' ? 'text-pink-400 border-b-2 border-pink-400' : 'text-gray-400 hover:text-pink-200'}`}
          >
            <Star size={18} className="mr-2" />
            Favorites
          </button>
          {/* Settings Tab Button */}
          <button 
            onClick={() => setActiveTab('settings')} 
            className={`px-4 py-3 flex items-center ${activeTab === 'settings' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-400 hover:text-pink-200'}`}
          >
            <Settings size={18} className="mr-2" />
            Settings
          </button>
          {/* Future tabs for Smashes and Passes */}
          {/* <button 
            onClick={() => setActiveTab('smashes')} 
            className={`px-4 py-3 flex items-center ${activeTab === 'smashes' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400 hover:text-gray-200'}`}
          >
            <Heart size={18} className="mr-2" />
            Smashes
          </button>
          <button 
            onClick={() => setActiveTab('passes')} 
            className={`px-4 py-3 flex items-center ${activeTab === 'passes' ? 'text-red-400 border-b-2 border-red-400' : 'text-gray-400 hover:text-gray-200'}`}
          >
            <X size={18} className="mr-2" />
            Passes
          </button> */}
        </div>
        
        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'profile' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-purple-900/30 p-4 rounded-lg border border-pink-500/20 card-hover">
                  <h3 className="text-sm text-gray-400 mb-1">Display Name</h3>
                  <p className="font-medium">{currentUser.displayName || 'Not set'}</p>
                </div>
                <div className="bg-purple-900/30 p-4 rounded-lg border border-pink-500/20 card-hover">
                  <h3 className="text-sm text-gray-400 mb-1">Email</h3>
                  <p className="font-medium">{currentUser.email}</p>
                </div>
                <div className="bg-purple-900/30 p-4 rounded-lg border border-pink-500/20 card-hover">
                  <h3 className="text-sm text-gray-400 mb-1">Account ID</h3>
                  <p className="font-medium text-xs truncate" title={currentUser.uid}>{currentUser.uid}</p>
                </div>
                <div className="bg-purple-900/30 p-4 rounded-lg border border-pink-500/20 card-hover">
                  <h3 className="text-sm text-gray-400 mb-1">Email Verified</h3>
                  <p className="font-medium">{currentUser.emailVerified ? 'Yes' : 'No'}</p>
                </div>
              </div>
              
              {/* Account Stats */}
              <div className="mt-8">
                <h2 className="text-xl font-bold mb-4 gradient-text">Your Stats</h2>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-purple-900/30 p-4 rounded-lg border border-pink-500/20 card-hover">
                    <div className="text-pink-400 mb-1"><Star size={24} className="inline animate-heartbeat" /></div>
                    <p className="text-2xl font-bold">{isLoadingFavorites ? <Loader2 className='animate-spin inline' /> : favorites.length}</p>
                    <p className="text-sm text-gray-400">Favorites</p>
                  </div>
                  <div className="bg-purple-900/30 p-4 rounded-lg border border-pink-500/20 card-hover">
                    <div className="text-pink-400 mb-1"><Heart size={24} className="inline animate-heartbeat" /></div>
                    <p className="text-2xl font-bold">{isLoadingStats ? <Loader2 className='animate-spin inline' /> : userStats.smashesCount}</p>
                    <p className="text-sm text-gray-400">Smashes</p>
                  </div>
                  <div className="bg-purple-900/30 p-4 rounded-lg border border-pink-500/20 card-hover">
                    <div className="text-red-400 mb-1"><X size={24} className="inline" /></div>
                    <p className="text-2xl font-bold">{isLoadingStats ? <Loader2 className='animate-spin inline' /> : userStats.passesCount}</p>
                    <p className="text-sm text-gray-400">Passes</p>
                  </div>
                </div>
              </div>

              {/* Support Development Section */}
              <div className="mt-8 pt-6 border-t border-pink-800/30">
                <h2 className="text-xl font-bold mb-4 gradient-text">Support Development</h2>
                <div className="bg-purple-900/30 p-6 rounded-lg border border-pink-500/20 card-hover text-center">
                  <Gift size={48} className="mx-auto text-pink-400 mb-3 animate-bounce" />
                  <p className="text-gray-300 mb-4">
                    Enjoying the app? Consider supporting its development and suggest new features!
                  </p>
                  <a
                    href="https://throne.com/quietdrone"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all transform hover:scale-105"
                  >
                    <Gift size={20} className="mr-2" />
                    Support on Throne
                  </a>
                  <a
                    href="https://discord.gg/2PvbSyBRQj"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex items-center justify-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all transform hover:scale-105"
                  >
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.223 12.223 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-4.762-.837-9.274-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                    </svg>
                    Join our Discord
                  </a>
                </div>
              </div>

            </div>
          )}
          
          {activeTab === 'favorites' && (
            <div>
              <h2 className="text-xl font-bold mb-4 gradient-text">Your Favorites</h2>
              {isLoadingFavorites ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 size={32} className="animate-spin text-pink-500 mr-3" />
                  <p>Loading favorites...</p>
                </div>
              ) : favorites.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {favorites.map((fav, index) => (
                    <div 
                      key={fav.id} 
                      className="bg-purple-900/30 rounded-lg shadow-md overflow-hidden aspect-[3/4.5] flex flex-col border border-pink-500/20 card-hover cursor-pointer"
                      onClick={() => openGallery(index)}
                    >
                      <div className="relative w-full h-[70%] flex-grow bg-black">
                        {fav.fileType === 'video' && fav.videoUrl ? (
                          <video 
                            src={fav.videoUrl} 
                            className="w-full h-full object-contain" 
                            autoPlay 
                            loop 
                            muted 
                            playsInline 
                          />
                        ) : fav.fileType === 'image' && fav.imageUrl ? (
                          <img 
                            src={fav.imageUrl} 
                            alt={fav.name} 
                            className="w-full h-full object-contain" 
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gray-600">
                            <ImageOff size={48} className="text-gray-400" />
                          </div>
                        )}
                      </div>
                      <div className="p-3 h-[30%]">
                        <h3 className="font-semibold text-sm truncate" title={fav.name}>{fav.name}</h3>
                        {fav.tags && fav.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1 text-xs max-h-10 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-500 scrollbar-track-gray-800">
                            {fav.tags.slice(0,3).map((tag, index) => (
                              <span key={index} className="bg-gray-600 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-purple-900/30 rounded-lg border border-pink-500/20">
                  <Star size={48} className="mx-auto text-pink-400 mb-3 animate-heartbeat" />
                  <h3 className="text-xl font-medium mb-2">No favorites yet</h3>
                  <p className="text-gray-400 mb-4">Characters you favorite will appear here</p>
                  <Link to="/" className="inline-block px-4 py-2 bg-pink-600 hover:bg-pink-700 rounded-md text-white transition-colors">
                    Start Swiping
                  </Link>
                </div>
              )}
            </div>
          )}
          
          {/* Settings Tab Content */}
          {activeTab === 'settings' && (
            <div className="space-y-8">
              <h2 className="text-2xl font-semibold gradient-text">Account Settings</h2>
              
              {/* Change Username Section */}
              <form onSubmit={handleChangeUsername} className="bg-purple-900/30 p-6 rounded-lg shadow-md border border-pink-500/20 card-hover">
                <h3 className="text-xl font-medium text-pink-300 mb-4">Change Username</h3>
                {usernameStatus.message && (
                  <div className={`mb-4 p-3 rounded-md text-sm flex items-center ${usernameStatus.type === 'success' ? 'bg-green-600/30 text-green-300' : 'bg-red-600/30 text-red-300'}`}>
                    {usernameStatus.type === 'success' ? <CheckCircle size={18} className="mr-2" /> : <AlertCircle size={18} className="mr-2" />}
                    {usernameStatus.message}
                  </div>
                )}
                {!isLoadingTimestamps && !usernameChangePolicy.allowed && (
                  <div className="mb-4 p-3 rounded-md text-sm flex items-center bg-yellow-600/30 text-yellow-300">
                    <Clock size={18} className="mr-2" />
                    <span>You can change your username again in {usernameChangePolicy.timeLeft}.</span>
                  </div>
                )}
                <div className="mb-4">
                  <label htmlFor="newDisplayName" className="block text-sm font-medium text-gray-300 mb-1">New Username</label>
                  <input 
                    type="text" 
                    id="newDisplayName" 
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    className="w-full p-2 bg-gray-800 border border-pink-500/30 rounded-md text-white focus:ring-pink-500 focus:border-pink-500"
                    placeholder="Enter new username"
                    required
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={isLoadingTimestamps || !usernameChangePolicy.allowed || isUpdatingUsername || !newDisplayName.trim() || newDisplayName.trim() === (currentUser?.displayName || '')}
                  className="w-full px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isUpdatingUsername ? <Loader2 size={20} className="animate-spin mr-2" /> : null}
                  {isLoadingTimestamps ? 'Loading policy...' : (isUpdatingUsername ? 'Updating...' : 'Save Username')}
                </button>
              </form>

              {/* Change Password Section */}
              <form onSubmit={handleChangePassword} className="bg-purple-900/30 p-6 rounded-lg shadow-md border border-pink-500/20 card-hover">
                <h3 className="text-xl font-medium text-pink-300 mb-4">Change Password</h3>
                {passwordStatus.message && (
                  <div className={`mb-4 p-3 rounded-md text-sm flex items-center ${passwordStatus.type === 'success' ? 'bg-green-600/30 text-green-300' : 'bg-red-600/30 text-red-300'}`}>
                    {passwordStatus.type === 'success' ? <CheckCircle size={18} className="mr-2" /> : <AlertCircle size={18} className="mr-2" />}
                    {passwordStatus.message}
                  </div>
                )}
                {!isLoadingTimestamps && !passwordChangePolicy.allowed && (
                  <div className="mb-4 p-3 rounded-md text-sm flex items-center bg-yellow-600/30 text-yellow-300">
                    <Clock size={18} className="mr-2" />
                    <span>You can change your password again in {passwordChangePolicy.timeLeft}.</span>
                  </div>
                )}
                <div className="mb-4">
                  <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-300 mb-1">Current Password</label>
                  <input 
                    type="password" 
                    id="currentPassword" 
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full p-2 bg-gray-800 border border-pink-500/30 rounded-md text-white focus:ring-pink-500 focus:border-pink-500"
                    placeholder="Enter current password"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-300 mb-1">New Password</label>
                  <input 
                    type="password" 
                    id="newPassword" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full p-2 bg-gray-800 border border-pink-500/30 rounded-md text-white focus:ring-pink-500 focus:border-pink-500"
                    placeholder="Enter new password (min. 6 characters)"
                    required
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={isLoadingTimestamps || !passwordChangePolicy.allowed || isUpdatingPassword || !currentPassword || !newPassword || newPassword.length < 6}
                  className="w-full px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isUpdatingPassword ? <Loader2 size={20} className="animate-spin mr-2" /> : null}
                  {isLoadingTimestamps ? 'Loading policy...' : (isUpdatingPassword ? 'Updating...' : 'Change Password')}
                </button>
              </form>

              {/* Reset Data Section */}
              <div className="bg-purple-900/30 p-6 rounded-lg shadow-md border border-pink-500/20 card-hover">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xl font-medium text-red-400">Reset All Data</h3>
                    <Trash2 size={24} className="text-red-400" />
                </div>
                <p className="text-sm text-gray-400 mb-1">This will permanently delete all your smashes, passes, and favorites. Your account will not be deleted, but all activity will be wiped. <strong className="text-red-300">This action cannot be undone.</strong></p>
                {!isLoadingTimestamps && !dataResetPolicy.allowed && (
                  <div className="mb-3 p-3 rounded-md text-sm flex items-center bg-yellow-600/30 text-yellow-300">
                    <Clock size={18} className="mr-2" />
                    <span>You can reset your data again in {dataResetPolicy.timeLeft}.</span>
                  </div>
                )}
                {resetDataStatus.message && !showResetConfirm && ( 
                    <div className={`mt-2 mb-3 p-3 rounded-md text-sm flex items-center ${resetDataStatus.type === 'success' ? 'bg-green-600/30 text-green-300' : 'bg-red-600/30 text-red-300'}`}>
                        {resetDataStatus.type === 'success' ? <CheckCircle size={18} className="mr-2" /> : <AlertCircle size={18} className="mr-2" />}
                        {resetDataStatus.message}
                    </div>
                )}
                <button 
                  onClick={handleRequestResetData}
                  disabled={isLoadingTimestamps || !dataResetPolicy.allowed || isResettingData} 
                  className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isLoadingTimestamps && !lastDataResetTime ? <Loader2 size={20} className="animate-spin mr-2" /> : (isResettingData && showResetConfirm ? <Loader2 size={20} className="animate-spin mr-2" /> : <Trash2 size={18} className="mr-2" />)}
                  {isLoadingTimestamps && !lastDataResetTime ? 'Loading Policy...' : (isResettingData && showResetConfirm ? 'Resetting...' : 'Reset My Data')}
                </button>
              </div>

              {/* Delete Account Section */}
              <div className="bg-purple-900/30 p-6 rounded-lg shadow-md border border-pink-500/20 card-hover">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xl font-medium text-red-500">Delete Account</h3>
                    <AlertCircle size={24} className="text-red-500" />
                </div>
                <p className="text-sm text-gray-400 mb-3">This will permanently delete your account and all associated data (smashes, passes, favorites, profile information). <strong className="text-red-400">This action is irreversible and cannot be undone.</strong></p>
                {deleteAccountStatus.message && !showDeleteConfirm && ( 
                    <div className={`mt-2 mb-3 p-3 rounded-md text-sm flex items-center ${deleteAccountStatus.type === 'error' ? 'bg-red-600/30 text-red-300' : ''}`}>
                        {deleteAccountStatus.type === 'error' ? <AlertCircle size={18} className="mr-2" /> : null}
                        {deleteAccountStatus.message}
                    </div>
                )}
                <button 
                  onClick={handleRequestDeleteAccount}
                  disabled={isDeletingAccount} 
                  className="w-full px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isDeletingAccount ? <Loader2 size={20} className="animate-spin mr-2" /> : <Trash2 size={18} className="mr-2" />}
                  {isDeletingAccount ? 'Deleting...' : 'Delete My Account Permanently'}
                </button>
              </div>
            </div>
          )}
          
          {/* Future tab content for Smashes and Passes */}
        </div>
      </div>

      {/* Reset Data Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <form onSubmit={handleConfirmResetAllData} className="bg-gray-900 p-6 rounded-lg shadow-2xl w-full max-w-md space-y-4 border border-pink-500/30">
            <h3 className="text-xl font-semibold text-red-500 flex items-center"><AlertCircle size={24} className="mr-2"/>Confirm Data Reset</h3>
            <p className="text-gray-300 text-sm">Are you absolutely sure you want to reset all your data? All your smashes, passes, and favorites will be erased. <strong className="text-red-400">This action is irreversible.</strong></p>
            
            {resetDataStatus.message && (
              <div className={`p-3 rounded-md text-sm flex items-center ${resetDataStatus.type === 'success' ? 'bg-green-600/30 text-green-300' : 'bg-red-600/30 text-red-300'}`}>
                 <AlertCircle size={18} className="mr-2" />
                {resetDataStatus.message}
              </div>
            )}

            <div className="mb-4">
              <label htmlFor="resetCurrentPassword" className="block text-sm font-medium text-gray-300 mb-1">Enter Current Password to Confirm</label>
              <input 
                type="password" 
                id="resetCurrentPassword" 
                value={resetCurrentPassword}
                onChange={(e) => setResetCurrentPassword(e.target.value)}
                className="w-full p-2 bg-gray-800 border border-pink-500/30 rounded-md text-white focus:ring-pink-500 focus:border-pink-500"
                placeholder="Your current password"
                required
                disabled={isResettingData}
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button 
                type="button" 
                onClick={() => setShowResetConfirm(false)} 
                disabled={isResettingData}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={isResettingData || !resetCurrentPassword}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isResettingData ? <Loader2 size={20} className="animate-spin mr-2" /> : <Trash2 size={18} className="mr-2" />}
                Yes, Reset My Data
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <form onSubmit={handleConfirmDeleteAccount} className="bg-gray-900 p-6 rounded-lg shadow-2xl w-full max-w-md space-y-4 border border-pink-500/30">
            <h3 className="text-xl font-semibold text-red-500 flex items-center"><AlertCircle size={24} className="mr-2"/>Confirm Account Deletion</h3>
            <p className="text-gray-300 text-sm">Are you absolutely sure you want to permanently delete your account? All your data, including profile information, smashes, passes, and favorites, will be erased. <strong className="text-red-400">This action is irreversible.</strong></p>
            
            {deleteAccountStatus.message && (
              <div className={`p-3 rounded-md text-sm flex items-center ${deleteAccountStatus.type === 'error' ? 'bg-red-600/30 text-red-300' : ''}`}>
                 <AlertCircle size={18} className="mr-2" />
                {deleteAccountStatus.message}
              </div>
            )}

            <div className="mb-4">
              <label htmlFor="deleteCurrentPassword" className="block text-sm font-medium text-gray-300 mb-1">Enter Current Password to Confirm</label>
              <input 
                type="password" 
                id="deleteCurrentPassword" 
                value={deleteCurrentPassword}
                onChange={(e) => setDeleteCurrentPassword(e.target.value)}
                className="w-full p-2 bg-gray-800 border border-pink-500/30 rounded-md text-white focus:ring-pink-500 focus:border-pink-500"
                placeholder="Your current password"
                required
                disabled={isDeletingAccount}
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button 
                type="button" 
                onClick={() => setShowDeleteConfirm(false)} 
                disabled={isDeletingAccount}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={isDeletingAccount || !deleteCurrentPassword}
                className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isDeletingAccount ? <Loader2 size={20} className="animate-spin mr-2" /> : <Trash2 size={18} className="mr-2" />}
                Yes, Delete My Account Permanently
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Fullscreen Gallery Modal */}
      {isGalleryOpen && favorites.length > 0 && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[100] p-4"
          onClick={closeGallery}
        >
          <button
            onClick={(e) => { e.stopPropagation(); closeGallery(); }}
            className="absolute top-5 right-5 text-white hover:text-pink-300 z-[102] bg-black/30 rounded-full p-2 transition-colors"
            aria-label="Close gallery"
          >
            <X size={32} />
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); showPrevImage(); }}
            className="absolute left-5 top-1/2 -translate-y-1/2 text-white hover:text-pink-300 z-[101] bg-black/30 rounded-full p-3 transition-colors"
            aria-label="Previous image"
          >
            <ChevronLeft size={40} />
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); showNextImage(); }}
            className="absolute right-5 top-1/2 -translate-y-1/2 text-white hover:text-pink-300 z-[101] bg-black/30 rounded-full p-3 transition-colors"
            aria-label="Next image"
          >
            <ChevronRight size={40} />
          </button>

          <div 
            className="max-w-full max-h-full flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {favorites[currentGalleryIndex]?.fileType === 'video' && favorites[currentGalleryIndex]?.videoUrl ? (
              <video
                src={favorites[currentGalleryIndex].videoUrl}
                className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl shadow-pink-500/30"
                autoPlay
                controls
                loop
                playsInline
              />
            ) : favorites[currentGalleryIndex]?.fileType === 'image' && favorites[currentGalleryIndex]?.imageUrl ? (
              <img
                src={favorites[currentGalleryIndex].imageUrl}
                alt={favorites[currentGalleryIndex].name || 'Favorite content'}
                className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl shadow-pink-500/30"
              />
            ) : (
              <div className="w-[50vw] h-[50vh] flex items-center justify-center bg-gray-800 rounded-lg">
                <ImageOff size={64} className="text-gray-500" />
                <p className="ml-4 text-xl text-gray-400">Media not available</p>
              </div>
            )}
            {favorites[currentGalleryIndex]?.name && (
                <p className="mt-4 text-lg text-pink-200 font-semibold bg-black/50 px-3 py-1 rounded-md">
                    {favorites[currentGalleryIndex].name}
                </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfilePage;
