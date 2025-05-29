import { useState, useEffect, useRef, useCallback } from 'react';
import { Heart, X, Star, Loader2, AlertTriangle, RotateCcw, Volume2, VolumeX, User, LogOut, Settings } from 'lucide-react';
import { useSpring, animated } from '@react-spring/web';
import { useDrag } from '@use-gesture/react';
import { useNavigate, Link, Routes, Route } from 'react-router-dom'; 
import { useAuth } from './contexts/AuthContext'; 
import { auth, db } from './firebase'; 
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, limit, getDocs, increment } from 'firebase/firestore'; 
import './App.css';
import Login from './components/Auth/Login'; 
import Signup from './components/Auth/Signup'; 
import ProfilePage from './components/Profile/ProfilePage';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
const CARDS_TO_PRELOAD = 10;
const PRELOAD_THRESHOLD = 5;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // milliseconds
const GAY_BLACKLIST_TAGS = ['yaoi', 'shounen ai', 'male_only', 'bara', 'gender bender male to female', 'mpreg'];
const FUTA_BLACKLIST_TAGS = ['futanari', 'futa_only', 'futadom', 'futa'];
const FURRY_BLACKLIST_TAGS = ['canine', 'pony','furry', 'furry_female', 'anthro', 'feral', 'mammal'];

const MEDIA_TYPE_OPTIONS = {
  VIDEOS_PHOTOS: 'Videos & Photos',
  VIDEO_ONLY: 'Video Only',
  PHOTOS_ONLY: 'Photos Only',
};

// Add these new constants above the component
const LUSTFUL_GRADIENT = "bg-gradient-to-br from-[#2d0a2e] to-[#1a0a2e]";
const BUTTON_GRADIENT = "bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500";
const CARD_GRADIENT = "bg-gradient-to-br from-pink-900/20 to-purple-900/20";

function App() {
  const [currentCard, setCurrentCard] = useState(null);
  const [upcomingCards, setUpcomingCards] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true); // For loading new card data or media
  const [isPreloadingBatch, setIsPreloadingBatch] = useState(false); // New state for preloading
  const [error, setError] = useState(null);
  const [totalCharacters, setTotalCharacters] = useState(0);
  const [seenCharacterIds, setSeenCharacterIds] = useState(new Set());
  const [isMuted, setIsMuted] = useState(true);
  const [currentCardMediaFailed, setCurrentCardMediaFailed] = useState(false);
  const [displayTags, setDisplayTags] = useState([]); // For shuffled tags
  const skipTimerRef = useRef(null);
  const [showSkipButton, setShowSkipButton] = useState(false);

  const { currentUser, loading: authLoading } = useAuth(); 
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSignupModalOpen, setIsSignupModalOpen] = useState(false);
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false); // New state for preferences modal
  const [isGayBlacklistEnabled, setIsGayBlacklistEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('isGayBlacklistEnabled') === 'true';
    }
    return false;
  });
  const [isFutaEnabled, setIsFutaEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('isFutaEnabled') === 'true';
    }
    return false;
  });
  const [isFurryEnabled, setIsFurryEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('isFurryEnabled') === 'true';
    }
    return false;
  });
  const [mediaTypePreference, setMediaTypePreference] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mediaTypePreference') || MEDIA_TYPE_OPTIONS.VIDEOS_PHOTOS;
    }
    return MEDIA_TYPE_OPTIONS.VIDEOS_PHOTOS;
  });

  const videoRef = useRef(null);
  const currentIndexRef = useRef(0);
  const navigate = useNavigate(); 
  const isInitialMountEffectDone = useRef(false);
  const isInitialMountMediaTypeEffect = useRef(true); // Moved for mediaTypePreference effect

  const openLoginModal = () => setIsLoginModalOpen(true);
  const closeLoginModal = () => setIsLoginModalOpen(false);
  const openSignupModal = () => setIsSignupModalOpen(true);
  const closeSignupModal = () => setIsSignupModalOpen(false);

  // Preferences Modal Handlers
  const openPreferencesModal = () => setIsPreferencesModalOpen(true);
  const closePreferencesModal = () => setIsPreferencesModalOpen(false);

  const [springProps, api] = useSpring(() => ({
    x: 0, y: 0, rotateZ: 0, scale: 1,
    config: { tension: 300, friction: 30 }
  }));

  const preloadNextBatchRef = useRef();

  const loadInitialCardCallCounter = useRef(0); // Diagnostic counter

  // Add shuffle seed to state
  const [shuffleSeed, setShuffleSeed] = useState(Date.now());

  // Add these new state variables for the background animation
  const [swipeDirection, setSwipeDirection] = useState(null); // 'left', 'right', or null
  const [showBackground, setShowBackground] = useState(false);

  // Add a new useSpring for the background animation
  const backgroundSpringProps = useSpring({
    opacity: showBackground ? 1 : 0,
    config: { tension: 280, friction: 60 },
    onRest: () => {
      if (showBackground) {
        setShowBackground(false);
      }
    }
  });

  // Effect for initial card load ON MOUNT
  useEffect(() => {
    console.log('[App.jsx Mount Effect] Running ONCE.');
    const performInitialLoadOnMount = async () => {
      setError(null);
      setCurrentCardMediaFailed(false);
      setIsLoading(true);
      setIsMuted(true); // Default to muted on new card
      currentIndexRef.current = 0;
      if (api && api.start) {
          api.start({ x: 0, y: 0, rotateZ: 0, scale: 1, immediate: true });
      }
      try {
        let fetchUrl = `${API_BASE_URL}/characters/random`;
        const queryParams = [];

        // Note: currentUser might be null here initially if auth is still loading.
        // AuthContext provides currentUser, which might update after this initial fetch.
        // If relying on currentUser for the very first fetch, ensure authLoading is false.
        // For now, we proceed, and subsequent loads (e.g., via handleReset) will use updated currentUser.
        if (currentUser && currentUser.uid) { 
            queryParams.push(`userId=${encodeURIComponent(currentUser.uid)}`);
        }
        // Add media type preference to query
        if (mediaTypePreference) {
          queryParams.push(`media_type=${encodeURIComponent(mediaTypePreference)}`);
        }
        const combinedBlacklist = [];
        if (isGayBlacklistEnabled) combinedBlacklist.push(...GAY_BLACKLIST_TAGS);
        if (isFutaEnabled) combinedBlacklist.push(...FUTA_BLACKLIST_TAGS);
        if (isFurryEnabled) combinedBlacklist.push(...FURRY_BLACKLIST_TAGS);
        if (combinedBlacklist.length) {
          const unique = Array.from(new Set(combinedBlacklist));
          queryParams.push(`blacklisted_tags=${encodeURIComponent(unique.join(','))}`);
        }

        if (queryParams.length > 0) {
            fetchUrl += `?${queryParams.join('&')}`;
        }

        console.log('[App.jsx InitialMountLoad] Fetching from:', fetchUrl);
        const response = await fetch(fetchUrl);
        const responseText = await response.text();
        console.log('[App.jsx InitialMountLoad] Raw response status:', response.status);
        // console.log('[App.jsx InitialMountLoad] Raw response text:', responseText); // Keep this commented unless debugging large text

        if (!response.ok) {
          try {
            const errorData = JSON.parse(responseText);
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
          } catch (parseError) {
            throw new Error(`HTTP error! status: ${response.status}. Response: ${responseText.substring(0, 200)}...`);
          }
        }
        const data = JSON.parse(responseText);

        if (data.character) {
          setCurrentCard(data.character);
          setSeenCharacterIds(new Set([data.character.name])); // Initialize seen set with the first character
          setTotalCharacters(data.totalCharacters || 0);
          // Preloading will be handled by the generic preloading useEffect once currentCard is set
        } else if (data.message === "No characters available based on exclusions." || data.message === "No characters available in cache.") {
          setError(data.message);
          setCurrentCard(null);
        } else {
          setError('Failed to load initial character data.');
          setCurrentCard(null);
        }
      } catch (err) {
        console.error('Failed to load initial card on mount:', err);
        setError(err.message || 'Failed to load initial character.');
        setCurrentCard(null);
      } finally {
        setIsLoading(false);
        isInitialMountEffectDone.current = true;
      }
    };

    performInitialLoadOnMount();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // STRICTLY EMPTY DEPENDENCY ARRAY FOR ONCE-OFF MOUNT

  const loadInitialCard = useCallback(async () => {
    loadInitialCardCallCounter.current += 1;
    console.log(`[App.jsx loadInitialCard CALLBACK INVOKED] Count: ${loadInitialCardCallCounter.current}, current seenCharacterIds size: ${seenCharacterIds.size}`);
    setError(null); // Clear global errors
    setCurrentCardMediaFailed(false); // Reset media failed state for the new card
    setIsLoading(true);
    setIsMuted(true);
    currentIndexRef.current = 0;
    api.start({ x: 0, y: 0, rotateZ: 0, scale: 1, immediate: true });
    try {
      const excludedIdsString = Array.from(seenCharacterIds).join(',');
      let fetchUrl = `${API_BASE_URL}/characters/random`;
      const queryParams = [];
      if (excludedIdsString) {
        queryParams.push(`exclude_ids=${encodeURIComponent(excludedIdsString)}`);
      }
      if (currentUser && currentUser.uid) {
        queryParams.push(`userId=${encodeURIComponent(currentUser.uid)}`);
      }
      // Add media type preference to query
      if (mediaTypePreference) {
        queryParams.push(`media_type=${encodeURIComponent(mediaTypePreference)}`);
      }
      const combinedBlacklist = [];
      if (isGayBlacklistEnabled) combinedBlacklist.push(...GAY_BLACKLIST_TAGS);
      if (isFutaEnabled) combinedBlacklist.push(...FUTA_BLACKLIST_TAGS);
      if (isFurryEnabled) combinedBlacklist.push(...FURRY_BLACKLIST_TAGS);
      if (combinedBlacklist.length) {
        const unique = Array.from(new Set(combinedBlacklist));
        queryParams.push(`blacklisted_tags=${encodeURIComponent(unique.join(','))}`);
      }
      if (queryParams.length > 0) {
        fetchUrl += `?${queryParams.join('&')}`;
      }
      
      console.log('[App.jsx loadInitialCard] Fetching from:', fetchUrl);
      const response = await fetch(fetchUrl);
      const responseText = await response.text();

      if (!response.ok) {
        try {
          const errorData = JSON.parse(responseText);
          throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        } catch (parseError) {
          throw new Error(`HTTP error! status: ${response.status}. Response: ${responseText.substring(0,200)}...`);
        }
      }
      const data = JSON.parse(responseText);

      if (data.character) {
        setCurrentCard(data.character);
        setSeenCharacterIds(prev => new Set(prev).add(data.character.name));
        setTotalCharacters(data.totalCharacters || 0); // For "seen all" logic
        // DO NOT call preloadNextBatchRef.current() here.
        // The generic preloading useEffect will handle it.
      } else if (data.message === "No characters available based on exclusions." || data.message === "No characters available in cache.") {
        setError(data.message); // Show specific message from backend
        setCurrentCard(null); // Ensure no card is displayed
      } else {
        setError('Failed to load character data.');
        setCurrentCard(null);
      }
    } catch (err) {
      console.error('[App.jsx loadInitialCard] Error:', err);
      setError(err.message || 'Failed to load character.');
      setCurrentCard(null);
    } finally {
      setIsLoading(false);
    }
  }, [api, seenCharacterIds, setError, setCurrentCardMediaFailed, setIsLoading, setIsMuted, setCurrentCard, setSeenCharacterIds, setTotalCharacters, currentUser, isGayBlacklistEnabled, isFutaEnabled, isFurryEnabled, mediaTypePreference]); 

  const loadNextCard = useCallback(() => {
    api.start({ x: 0, y: 0, rotateZ: 0, scale: 1, immediate: true });
    setIsLoading(true);
    setIsMuted(true);

    if (upcomingCards.length > 0) {
      const next = upcomingCards[0];
      setCurrentCard(next);
      setUpcomingCards(prev => prev.slice(1));
      setSeenCharacterIds(prev => new Set(prev).add(next.name));
      setIsLoading(true); // For the media of the new card
      setCurrentCardMediaFailed(false); // Reset media failed state for the new card
      currentIndexRef.current++;
    } else {
      if (totalCharacters > 0 && seenCharacterIds.size >= totalCharacters) {
        setError("You've seen all available characters! Try resetting.");
        setCurrentCard(null);
        return;
      }
      loadInitialCard();
    }
  }, [api, upcomingCards, totalCharacters, seenCharacterIds.size, loadInitialCard]); 

  const handleAction = useCallback(async (actionType) => {
    if (!currentCard) return;
    console.log(`${actionType} on:`, currentCard.name, currentCard.originalTag ? `(Tag: ${currentCard.originalTag})` : '');

    if (actionType === 'Favorite') {
      if (!currentUser) {
        console.warn('Favorite action: No user logged in. Cannot save favorite.');
        openLoginModal(); // Prompt user to log in
        return; // Do not proceed to load next card or attempt to save
      } else {
        try {
          const favoriteData = {
            name: currentCard.name,
            imageUrl: currentCard.imageUrl || null,
            fileType: currentCard.fileType || 'image', 
            videoUrl: currentCard.videoUrl || null,
            tags: currentCard.tags || [],
            favoritedAt: serverTimestamp()
          };
          const favDocRef = doc(db, 'users', currentUser.uid, 'favorites', currentCard.name);
          await setDoc(favDocRef, favoriteData);
          console.log(`Favorite '${currentCard.name}' saved for user ${currentUser.uid}`);

          // Record 'favorite' as a weighted interaction (double smash) for personalization
          if (currentCard.originalTag) {
            try {
              const prefResponse = await fetch(`${API_BASE_URL}/users/preferences/interact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId: currentUser.uid,
                  characterTag: currentCard.originalTag,
                  interactionType: 'favorite'
                }),
              });
              if (prefResponse.ok) {
                const prefResData = await prefResponse.json();
                console.log('Successfully recorded favorite preference:', prefResData.message);
              } else {
                const errorData = await prefResponse.json().catch(() => ({ message: 'Failed to record favorite preference.' }));
                console.error('Failed to record favorite preference:', prefResponse.status, errorData.message);
              }
            } catch (err) {
              console.error('Error recording favorite preference:', err);
            }
          }
        } catch (error) {
          console.error('Error saving favorite to Firestore:', error);
          setError('Failed to save favorite. Please try again.');
          return; 
        }
      }
    } else if (actionType === 'Smash' || actionType === 'Pass') {
      if (currentUser) {
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const fieldToIncrement = actionType === 'Smash' ? 'smashesCount' : 'passesCount';
          await setDoc(userDocRef, { 
            [fieldToIncrement]: increment(1),
            lastActive: serverTimestamp() // Optionally update last active time
          }, { merge: true });
          console.log(`${actionType} count incremented for user ${currentUser.uid}`);

          // Record detailed tag preference
          if (currentCard.originalTag) {
            try {
              const preferenceResponse = await fetch(`${API_BASE_URL}/users/preferences/interact`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  userId: currentUser.uid,
                  characterTag: currentCard.originalTag,
                  interactionType: actionType.toLowerCase(), // 'smash' or 'pass'
                }),
              });
              if (preferenceResponse.ok) {
                const prefData = await preferenceResponse.json();
                console.log('Successfully recorded tag preference:', prefData.message);
              } else {
                const errorData = await preferenceResponse.json().catch(() => ({ message: 'Failed to record tag preference and parse error response.' }));
                console.error('Failed to record tag preference:', preferenceResponse.status, errorData.message);
              }
            } catch (prefError) {
              console.error('Error calling preference API:', prefError);
            }
          } else {
            console.warn('Cannot record tag preference: currentCard.originalTag is missing.');
          }

        } catch (error) {
          console.error(`Error incrementing ${actionType} count:`, error);
          // Non-critical error, so we can still proceed to load the next card
          // setError(`Failed to update ${actionType} count.`); // Optional: inform user
        }
      }
    }

    loadNextCard();
  }, [currentCard, loadNextCard, currentUser, setError, openLoginModal]); 

  const triggerSwipe = useCallback((direction) => {
    if (!currentCard) return;
    const x = (direction === 'right' ? 1 : -1) * (window.innerWidth + 200);
    const rot = (direction === 'right' ? 1 : -1) * 15;
    
    // Set the swipe direction and show the background
    setSwipeDirection(direction);
    setShowBackground(true);
    
    api.start({
      to: { x, rotateZ: rot, scale: 1.1 },
      config: { friction: 50, tension: 280 },
    });
  }, [api, currentCard]);

  const bind = useDrag(({ args: [cardId], active, movement: [mx], direction: [xDir], velocity: [vx], down, last }) => {
    if (!currentCard || cardId !== currentCard.name) return;

    if (last) { // This means the drag gesture has ended
      const triggerVelocity = Math.abs(vx) > 0.2;
      const triggerDistance = Math.abs(mx) > window.innerWidth / 4;
      if (triggerVelocity || triggerDistance) {
        const swipeDirection = xDir > 0 ? 'right' : 'left';
        const actionType = swipeDirection === 'right' ? 'Smash' : 'Pass';
        
        if (!isLoading) { // Check isLoading similar to button presses
          handleAction(actionType);    // Action first
          triggerSwipe(swipeDirection); // Then animation
        } else {
          // If loading, just snap back to prevent issues during card transitions
          api.start({ x: 0, rotateZ: 0, scale: 1, config: { friction: 30, tension: 300 } });
        }
      } else {
        // Card snaps back if not a valid swipe
        api.start({ x: 0, rotateZ: 0, scale: 1, config: { friction: 30, tension: 300 } });
      }
    } else { // While dragging
      api.start({
        x: mx,
        rotateZ: mx / 20,
        scale: active ? 1.05 : 1,
        immediate: false,
        config: { friction: 50, tension: active ? 800 : 500 }
      });
    }
  }, { pointer: { touch: true } });

  const handleButtonSmash = () => { 
    if (!isLoading && currentCard) {
      setSwipeDirection('right'); // Set direction first
      setShowBackground(true); // Show background effect
      handleAction('Smash'); // Call action 
      triggerSwipe('right'); // Then start animation
    }
  };
  
  const handleButtonPass = () => { 
    if (!isLoading && currentCard) {
      setSwipeDirection('left'); // Set direction first
      setShowBackground(true); // Show background effect
      handleAction('Pass'); // Call action
      triggerSwipe('left'); // Then start animation
    }
  };
  
  const handleButtonFavorite = () => {
    if (!currentCard || isLoading) return;
    handleAction('Favorite'); // Call action immediately
    // Start animation (bounce)
    api.start({
      to: async (next) => {
        await next({ y: -30, scale: 1.05, config: { tension: 400 }});
        await next({ y: 0, scale: 1, config: { tension: 400 }});
      },
    });
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (isLoading || !currentCard || isLoginModalOpen || isSignupModalOpen || isPreferencesModalOpen) {
        // Don't process key events if loading, no card, or modal is open
        return;
      }

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault(); // Prevent default browser action for arrow keys
          console.log('Keyboard: ArrowLeft -> Pass');
          handleAction('Pass');
          triggerSwipe('left'); // Also trigger swipe animation
          break;
        case 'ArrowRight':
          event.preventDefault();
          console.log('Keyboard: ArrowRight -> Smash');
          handleAction('Smash');
          triggerSwipe('right'); // Also trigger swipe animation
          break;
        case 'ArrowDown':
          event.preventDefault();
          console.log('Keyboard: ArrowDown -> Favorite');
          handleAction('Favorite');
          // Trigger favorite animation (bounce)
          api.start({
            to: async (next) => {
              await next({ y: -30, scale: 1.05, config: { tension: 400 }});
              await next({ y: 0, scale: 1, config: { tension: 400 }});
            },
          });
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLoading, currentCard, handleAction, triggerSwipe, api, isLoginModalOpen, isSignupModalOpen, isPreferencesModalOpen]);

  const handleToggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  }, [setIsMuted]);

  const fetchCharacters = useCallback(async (page, limit) => {
    const queryParams = [
      `page=${page}`,
      `limit=${limit}`,
      `media_type=${encodeURIComponent(mediaTypePreference)}`,
      `seed=${shuffleSeed}` // Include shuffle seed
    ];
    const excludedIdsString = Array.from(seenCharacterIds).join(',');
    let url = `${API_BASE_URL}/characters`;
    if (excludedIdsString) {
      queryParams.push(`exclude_ids=${encodeURIComponent(excludedIdsString)}`);
    }
    if (currentUser && currentUser.uid) {
      queryParams.push(`userId=${encodeURIComponent(currentUser.uid)}`);
    }
    const combinedBlacklist = [];
    if (isGayBlacklistEnabled) combinedBlacklist.push(...GAY_BLACKLIST_TAGS);
    if (isFutaEnabled) combinedBlacklist.push(...FUTA_BLACKLIST_TAGS);
    if (isFurryEnabled) combinedBlacklist.push(...FURRY_BLACKLIST_TAGS);
    if (combinedBlacklist.length) {
      const unique = Array.from(new Set(combinedBlacklist));
      queryParams.push(`blacklisted_tags=${encodeURIComponent(unique.join(','))}`);
    }
    if (queryParams.length > 0) {
      url += `?${queryParams.join('&')}`;
    }
    
    console.log('[App.jsx fetchCharacters] Fetching from:', url);
    const abortController = new AbortController();
    const response = await fetch(url, { signal: abortController.signal });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    setTotalCharacters(data.totalCharacters || 0);
    const newCharacters = data.characters.filter(char =>
      !seenCharacterIds.has(char.name) &&
      char.name !== currentCard?.name &&
      !upcomingCards.some(uc => uc.name === char.name)
    );
    return newCharacters;
  }, [seenCharacterIds, currentCard, upcomingCards, setTotalCharacters, setError, currentUser, isGayBlacklistEnabled, isFutaEnabled, isFurryEnabled, mediaTypePreference, shuffleSeed]);

  preloadNextBatchRef.current = useCallback(async () => {
    if (isPreloadingBatch) return; // Prevent re-entry if already preloading
    if (isLoading && upcomingCards.length > 0) return; 
    if (totalCharacters > 0 && (seenCharacterIds.size + upcomingCards.length >= totalCharacters)) return;

    setIsPreloadingBatch(true); // Set flag before starting
    try {
      const newCards = await fetchCharacters(currentPage, CARDS_TO_PRELOAD); 
      if (newCards.length > 0) {
        setUpcomingCards(prev => [...new Set([...prev, ...newCards].map(c => JSON.stringify(c)))].map(s => JSON.parse(s)));
        setCurrentPage(prev => prev + 1);
      }
    } catch (err) {
      // Error is handled by fetchCharacters and sets global error state
      console.error('[App.jsx preloadNextBatch] Error during fetch:', err);
    } finally {
      setIsPreloadingBatch(false); // Clear flag when done or on error
    }
  }, [
    fetchCharacters, 
    currentPage, 
    isLoading, 
    upcomingCards.length, 
    totalCharacters, 
    seenCharacterIds.size, 
    setUpcomingCards, 
    setCurrentPage,
    isPreloadingBatch,
    isGayBlacklistEnabled,
    isFutaEnabled,
    isFurryEnabled,
    mediaTypePreference,
    shuffleSeed
  ]);

  const handleSkip = useCallback(() => {
    clearTimeout(skipTimerRef.current);
    setShowSkipButton(false);
    loadNextCard();
  }, [loadNextCard]);

  useEffect(() => {
    if (!currentCard) return;
    setShowSkipButton(false);
    if (skipTimerRef.current) clearTimeout(skipTimerRef.current);
    skipTimerRef.current = setTimeout(() => {
      setShowSkipButton(true);
    }, 3000);
    return () => clearTimeout(skipTimerRef.current);
  }, [currentCard]);

  // Helper function to shuffle an array (Fisher-Yates)
  const shuffleArray = (array) => {
    if (!array) return [];
    const newArray = [...array]; // Create a copy to avoid mutating the original
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  };

  // Effect to shuffle tags when currentCard changes
  useEffect(() => {
    if (currentCard && currentCard.tags && Array.isArray(currentCard.tags)) {
      setDisplayTags(shuffleArray(currentCard.tags));
    } else {
      setDisplayTags([]); // Clear tags if no current card or no tags array
    }
  }, [currentCard]);

  useEffect(() => {
    if (!isPreloadingBatch && currentCard && upcomingCards.length < PRELOAD_THRESHOLD && (totalCharacters === 0 || (seenCharacterIds.size + upcomingCards.length) < totalCharacters)) {
      if (preloadNextBatchRef.current) {
        console.log('[App.jsx Preload Effect] Conditions met, calling preloadNextBatchRef.current()');
        preloadNextBatchRef.current();
      }
    }
  }, [currentCard, upcomingCards.length, totalCharacters, seenCharacterIds.size, isPreloadingBatch, preloadNextBatchRef]); // Added isPreloadingBatch and preloadNextBatchRef

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const handleReset = () => {
    console.log('[App.jsx handleReset] Resetting with new shuffle seed');
    setShuffleSeed(Date.now()); // Generate new seed on every reset
    setSeenCharacterIds(new Set());
    setUpcomingCards([]);
    setCurrentPage(1);
    setError(null);
    setCurrentCard(null); 
    setCurrentCardMediaFailed(false); // Reset media failure state
    setDisplayTags([]); // Reset display tags
    loadInitialCard();
  };

  const handleLogout = async () => {
    console.log('[App.jsx handleLogout] Attempting logout...'); // Diagnostic log
    try {
      await signOut(auth);
      navigate('/'); 
      console.log('User logged out successfully via App.jsx');
    } catch (error) {
      console.error('Logout Error in App.jsx:', error);
      setError('Failed to log out. Please try again.'); 
    }
  };

  useEffect(() => {
    if (isInitialMountEffectDone.current) { // Only run if the initial app load has finished
      console.log('[App.jsx Blacklist Toggle Effect] One or more blacklist toggles changed. Resetting cards.');
      handleReset();
    }
  }, [isGayBlacklistEnabled, isFutaEnabled, isFurryEnabled, currentUser]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('isGayBlacklistEnabled', isGayBlacklistEnabled);
      localStorage.setItem('isFutaEnabled', isFutaEnabled);
      localStorage.setItem('isFurryEnabled', isFurryEnabled);
    }
  }, [isGayBlacklistEnabled, isFutaEnabled, isFurryEnabled]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('mediaTypePreference', mediaTypePreference);
    }
  }, [mediaTypePreference]);

  // Update mediaTypePreference effect to reset seed
  useEffect(() => {
    if (isInitialMountMediaTypeEffect.current) return;
    setShuffleSeed(Date.now()); // New seed on preference change
    handleReset();
  }, [mediaTypePreference]);

  if (authLoading) {
    return (
      <div className="loading-container app-loading">
        <div className="spinner"></div>
        <p>Authenticating...</p>
      </div>
    );
  }

  return (
    <>
      <header className={`app-header ${LUSTFUL_GRADIENT} border-b-2 border-pink-700/60 shadow-lg shadow-pink-900/30`}>
        <div className="flex items-center">
          <Link to="/" className="flex items-center text-pink-100 hover:text-white transition-colors duration-300 mr-4 group">
            <Heart size={28} className="mr-2 text-pink-400 group-hover:text-pink-300 transition-colors duration-300 transform group-hover:scale-110" />
            <h1 className="text-2xl font-bold gradient-text bg-gradient-to-r from-pink-400 to-purple-400 group-hover:from-pink-300 group-hover:to-purple-300 transition-all duration-300">Smash or Pass</h1>
          </Link>
        </div>
        
        <div className="auth-buttons-header flex items-center gap-3">
          <button 
            onClick={openPreferencesModal} 
            className="p-2 rounded-lg bg-pink-700/40 hover:bg-pink-700/60 border border-pink-600/50 transition-all duration-300 transform hover:scale-105"
            title="Preferences"
          >
            <Settings size={22} className="text-pink-200 hover:text-white transition-colors duration-300" />
          </button>
          {currentUser ? (
            <>
              <span className="user-greeting mr-2 text-sm text-pink-200 hidden sm:inline">Hi, {currentUser.displayName || currentUser.email.split('@')[0]}!</span>
              <Link 
                to="/profile" 
                className="header-auth-button flex items-center text-sm px-3 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transition-all duration-300 transform hover:scale-105 shadow-md hover:shadow-lg" 
                title="Your Profile"
              >
                <User size={18} className="mr-1.5 text-pink-100" />
                <span className="hidden sm:inline text-pink-50 font-medium">Profile</span>
              </Link>
              <button 
                onClick={handleLogout} 
                className="header-auth-button flex items-center text-sm px-3 py-2 rounded-lg bg-gray-700/50 hover:bg-gray-600/70 border border-gray-600/50 transition-all duration-300 transform hover:scale-105 shadow-md hover:shadow-lg" 
                title="Log Out"
              >
                <LogOut size={18} className="mr-1.5 text-pink-200" />
                <span className="hidden sm:inline text-pink-100 font-medium">Logout</span>
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={openLoginModal} 
                className="header-auth-button text-sm px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 transition-all duration-300 transform hover:scale-105 shadow-md hover:shadow-lg text-white font-medium"
              >
                Login
              </button>
              <button 
                onClick={openSignupModal} 
                className="header-auth-button text-sm px-4 py-2 rounded-lg bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-400 hover:to-teal-400 transition-all duration-300 transform hover:scale-105 shadow-md hover:shadow-lg text-white font-medium"
              >
                Sign Up
              </button>
            </>
          )}
        </div>
      </header>

      {isLoginModalOpen && <Login onClose={closeLoginModal} onSwitchToSignup={openSignupModal} />}
      {isSignupModalOpen && <Signup onClose={closeSignupModal} onSwitchToLogin={openLoginModal} />}
      {isPreferencesModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="lustful-bg p-8 rounded-2xl shadow-2xl w-full max-w-md relative overflow-hidden border-2 border-pink-500/30">
            <div className="absolute inset-0 bg-gradient-to-br from-pink-900/30 to-purple-900/30"></div>
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold gradient-text bg-gradient-to-r from-pink-400 to-purple-400">
                  Preferences
                </h2>
                <button onClick={closePreferencesModal} className="text-pink-300 hover:text-pink-100 transition-colors">
                  <X size={28} strokeWidth={2.5} />
                </button>
              </div>

              {/* Toggles */}
              <div className="space-y-6 mb-8">
                {[
                  { label: 'Gay Blacklist', state: isGayBlacklistEnabled, setter: setIsGayBlacklistEnabled },
                  { label: 'Futa Blacklist', state: isFutaEnabled, setter: setIsFutaEnabled },
                  { label: 'Furry Blacklist', state: isFurryEnabled, setter: setIsFurryEnabled }
                ].map(({ label, state, setter }) => (
                  <div key={label} className="flex items-center justify-between p-3 bg-pink-900/30 rounded-xl">
                    <span className="text-pink-100 font-medium">{label}</span>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={state}
                        onChange={(e) => setter(e.target.checked)}
                        className="w-11 h-6 rounded-full checked:bg-pink-500 border-2 border-pink-400/50 focus:ring-pink-400"
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>
                ))}
              </div>

              {/* Media Type Dropdown */}
              <div className="mb-8">
                <label className="block text-pink-200 mb-3 text-sm font-medium">Media Preference</label>
                <select
                  value={mediaTypePreference}
                  onChange={(e) => setMediaTypePreference(e.target.value)}
                  className="w-full bg-pink-900/30 border-2 border-pink-500/30 rounded-xl p-3 text-pink-100 
                           focus:ring-2 focus:ring-pink-400 focus:border-transparent custom-scrollbar
                           bg-gradient-to-br from-pink-900/40 to-purple-900/40"
                >
                  {Object.values(MEDIA_TYPE_OPTIONS).map(option => (
                    <option key={option} value={option} className="bg-pink-800 text-pink-100">
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <button 
                onClick={closePreferencesModal}
                className="w-full py-3 bg-gradient-to-r from-pink-600 to-purple-600 rounded-xl 
                         font-bold text-pink-50 hover:from-pink-500 hover:to-purple-500 transition-all
                         shadow-lg hover:shadow-pink-500/20 active:scale-95"
              >
                Apply Preferences
              </button>
            </div>
          </div>
        </div>
      )}

      <Routes>
        <Route path="/" element={
          <div className={`flex flex-col items-center justify-center min-h-screen text-white p-4 select-none overflow-hidden relative lustful-bg`}>
            {/* REMOVE Preferences Icon from here */}
            {/* 
            <button 
              onClick={openPreferencesModal} 
              className="absolute top-4 right-4 text-white p-2 rounded-full hover:bg-gray-700 transition-colors z-20"
              title="Preferences"
            >
              <Settings size={24} />
            </button>
            */}

            {error && (
              <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-700 text-white p-3 rounded-md shadow-lg z-50 flex items-center max-w-md">
                <AlertTriangle size={20} className="mr-2 flex-shrink-0" /> 
                <span className="text-sm">{error}</span>
              </div>
            )}
            
            {isLoading && !currentCard && !error && (
              <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
                <Loader2 size={64} className="animate-spin mb-4" />
                <p>Loading characters...</p>
              </div>
            )}

            {error && !currentCard && (
              <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4 text-center">
                <AlertTriangle size={64} className="text-red-500 mb-4" />
                <p className="text-xl mb-2">{error}</p>
                {seenCharacterIds.size >= totalCharacters && totalCharacters > 0 && (
                    <p className="mb-4">You've seen all available characters!</p>
                )}
                <button
                  onClick={handleReset}
                  className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold flex items-center transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-lg"
                >
                  <RotateCcw size={20} className="mr-2" /> Try Resetting
                </button>
              </div>
            )}
            
            {!currentCard && !isLoading && !error && (
               <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4 text-center">
                 <AlertTriangle size={64} className="text-yellow-500 mb-4" />
                 <p className="text-xl mb-2">No character to display.</p>
                 <p className="text-sm text-gray-400 mb-4">This might be a temporary issue or all characters have been seen.</p>
                 <button
                   onClick={handleReset} 
                   className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold flex items-center transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-lg"
                 >
                   <RotateCcw size={20} className="mr-2" /> Reset Characters
                 </button>
               </div>
             )}

            {/* Add the animated background gradient */}
            {swipeDirection && (
              <animated.div 
                style={{
                  ...backgroundSpringProps,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 1,
                  pointerEvents: 'none' // So it doesn't interfere with interactions
                }}
                className={`${
                  swipeDirection === 'left'
                    ? 'bg-gradient-to-r from-red-600/70 to-transparent'
                    : swipeDirection === 'right'
                      ? 'bg-gradient-to-l from-green-600/70 to-transparent'
                      : ''
                }`}
              />
            )}

            {currentCard && (
              <animated.div
                {...bind(currentCard.name)} 
                style={{
                  ...springProps,
                  zIndex: 2, // Make sure card is above the background
                }}
                className={`w-full max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl rounded-xl shadow-2xl overflow-hidden aspect-[3/4.5] flex flex-col cursor-grab active:cursor-grabbing touch-pan-y select-none relative ${CARD_GRADIENT} border-2 border-pink-900/30`}
                key={currentIndexRef.current} 
              >
                <div className="relative w-full h-[80%] flex-grow bg-black">
                  {isLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/75 z-10">
                          <Loader2 size={48} className="animate-spin" />
                      </div>
                  )}

                  {currentCard.fileType === 'video' && currentCard.imageUrl && (
                    <div className="relative w-full h-full">
                      {showSkipButton && (
                        <button onClick={handleSkip} className="absolute top-2 right-2 bg-gray-800/75 text-white px-3 py-1 rounded z-20">
                          Skip
                        </button>
                      )}
                      <video
                        ref={videoRef}
                        src={currentCard.imageUrl}
                        className="w-full h-full object-contain"
                        autoPlay
                        loop
                        muted={isMuted}
                        playsInline
                        onLoadedData={() => { setIsLoading(false); clearTimeout(skipTimerRef.current); setShowSkipButton(false); }} // Media loaded successfully
                        onError={(e) => {
                          console.error('Video load error:', e);
                          setError(`Error loading video: ${currentCard.name}`);
                          setCurrentCardMediaFailed(true);
                          setIsLoading(false); // Stop loading spinner for this card
                          clearTimeout(skipTimerRef.current);
                          setShowSkipButton(false);
                        }}
                      />
                      {/* Mute button only on videos */}
                      <button 
                        onClick={handleToggleMute} 
                        className="absolute bottom-3 right-3 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                        title={isMuted ? "Unmute" : "Mute"}
                      >
                        {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                      </button>
                    </div>
                  )}
                  {currentCard.fileType === 'image' && currentCard.imageUrl && !currentCardMediaFailed && (
                    <div className="relative w-full h-full">
                      {showSkipButton && (
                        <button onClick={handleSkip} className="absolute top-2 right-2 bg-gray-800/75 text-white px-3 py-1 rounded z-20">
                          Skip
                        </button>
                      )}
                      <img
                        src={currentCard.imageUrl}
                        alt={currentCard.name || 'Character image'}
                        className="w-full h-full object-contain"
                        onLoad={() => { setIsLoading(false); clearTimeout(skipTimerRef.current); setShowSkipButton(false); }} // Media loaded successfully
                        onError={(e) => {
                          console.error('Image load error:', e);
                          setError(`Error loading image: ${currentCard.name}`);
                          setCurrentCardMediaFailed(true);
                          setIsLoading(false); // Stop loading spinner for this card
                          clearTimeout(skipTimerRef.current);
                          setShowSkipButton(false);
                        }}
                      />
                    </div>
                  )}
                  {/* Display error on card if media failed */}
                  {currentCardMediaFailed && currentCard && (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-700 text-white p-4">
                      <AlertTriangle size={40} className="text-red-400 mb-2" />
                      <p className="text-center text-sm">Failed to load media for:</p>
                      <p className="text-center font-semibold text-md truncate" title={currentCard.name}>{currentCard.name}</p>
                    </div>
                  )}
                  {/* Display placeholder if no URL and media hasn't explicitly failed (e.g. API provided no URL) */}
                  {!currentCard.imageUrl && !currentCardMediaFailed && (
                     <div className="w-full h-full flex items-center justify-center bg-gray-700">
                        <p>Image/Video not available</p>
                     </div>
                  )}
                </div>
                <div className="p-5 bg-gray-800 text-white h-[20%] flex flex-col justify-between">
                  <h2 className="text-lg font-bold truncate" title={currentCard.name}>{currentCard.name}</h2>
                  {/* Tags Display */}
                  {currentCard && displayTags.length > 0 && (
                    <div className="mt-1 flex flex-wrap justify-center items-center gap-1 px-1 text-xs max-h-12 overflow-y-auto custom-scrollbar">
                      {displayTags.slice(0, 7).map((tag, index) => (
                        <span key={index} className="bg-pink-900/30 text-pink-200 px-2 py-1 rounded-full text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-around mt-2 items-center gap-4">
                    <button 
                      onClick={handleButtonPass} 
                      className={`p-4 ${BUTTON_GRADIENT} rounded-full shadow-lg transition-all hover:scale-110 active:scale-95`}
                    >
                      <X size={28} />
                    </button>
                    <button 
                      onClick={handleButtonFavorite} 
                      className={`p-4 ${BUTTON_GRADIENT} rounded-full shadow-lg transition-all hover:scale-110 active:scale-95`}
                    >
                      <Star size={28} />
                    </button>
                    <button 
                      onClick={handleButtonSmash} 
                      className={`p-4 ${BUTTON_GRADIENT} rounded-full shadow-lg transition-all hover:scale-110 active:scale-95`}
                    >
                      <Heart size={28} />
                    </button>
                  </div>
                </div>
              </animated.div>
            )}
          </div>
        } />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </>
  );
}

export default App;