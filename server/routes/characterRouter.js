const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { admin } = require('../services/firebaseAdmin'); // Ensure firebaseAdmin is set up
const seedrandom = require('seedrandom');
const characterRouter = express.Router();
const characterTagsFilePath = path.join(__dirname, '..', 'data', 'popular_character_tags.json');

let characterCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

let recentlyServedCharacterNames = [];
const RECENTLY_SERVED_MAX_SIZE = 15; 

function shuffleArray(array) {
  let currentIndex = array.length,  randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex !== 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }
  return array;
}

function formatCharacterName(rawName) {
  if (!rawName) return 'Unknown Character';

  // Remove parenthetical parts (e.g., "(one_piece)")
  let name = rawName.replace(/_\([^)]*\)/g, '').trim();
  // Replace underscores with spaces
  name = name.replace(/_/g, ' ');
  // Capitalize first letter of each word
  name = name.split(' ')
             .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
             .join(' ');
  return name;
}

// Modified shuffle function with seed
function seededShuffle(array, seed) {
  const rng = new seedrandom(seed);
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function initializeCharacterCache() { 
  const now = Date.now();
  if (characterCache && (now - lastCacheTime < CACHE_DURATION)) {
    console.log('Serving characters from existing (recent) cache.');
    return characterCache;
  }
  try {
    console.log('Attempting to read, shuffle, and cache character data from file:', characterTagsFilePath);
    const rawData = await fs.readFile(characterTagsFilePath, 'utf-8');
    let parsedData = JSON.parse(rawData);
    if (Array.isArray(parsedData) && parsedData.length > 0) {
      characterCache = parsedData; // Remove shuffle here
      lastCacheTime = now;
      console.log(`Successfully read, SHUFFLED, and cached ${characterCache.length} characters.`);
    } else {
      console.error('Parsed character data is not a non-empty array. Cache not updated.');
      if (!characterCache) characterCache = []; 
    }
    return characterCache;
  } catch (error) {
    console.error('Error reading, shuffling, or parsing character data file for cache initialization:', error);
    if (characterCache) {
      console.warn('Serving stale (but previously shuffled) cache due to file read error during re-validation.');
      return characterCache;
    }
    characterCache = []; 
    return []; 
  }
}

async function fetchRule34Image(characterTag, blacklistedTagsArray = [], mediaTypePreference) {
  if (!mediaTypePreference) {
    throw new Error('Media type preference is required');
  }
  
  let baseTags = `${characterTag} -ai_generated`;
  const originalMediaTypePreference = mediaTypePreference; // Keep original for logging or other logic if needed

  // Adjust tags based on media type preference
  if (mediaTypePreference === 'Video Only') {
    baseTags += ' animated'; // Still fetch animated, then filter client-side
  } else if (mediaTypePreference === 'Photos Only') {
    baseTags += ' -animated';
  }
  // If 'Videos & Photos', no specific animation tag is added or removed here by default

  const exclusionTags = blacklistedTagsArray.map(tag => `-${encodeURIComponent(tag.trim())}`).join(' ');
  const fullTags = exclusionTags ? `${baseTags} ${exclusionTags}` : baseTags;

  // DO NOT CHANGE THIS SORT QUERY. IT IS THE ONLY WAY TO GET THE HIGHEST SCORE POSTS.
  const apiUrl = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&limit=20&tags=${encodeURIComponent(fullTags)}%20sort%3Ascore%3Adesc&json=1`;

  try {
    console.log(`Fetching media for tags: "${fullTags}" with sort "score:desc" from URL: ${apiUrl}`);
    const response = await axios.get(apiUrl, { timeout: 10000 }); 
    
    if (Array.isArray(response.data) && response.data.length > 0) {
      let posts = response.data;

      // If the initial API call returned no posts (e.g. 'animated' tag yielded nothing, or other filters)
      if (posts.length === 0) {
        console.warn(`No posts found for tag: ${characterTag} with preference ${originalMediaTypePreference}. This might be after API filtering (e.g., for 'animated' or '-animated').`);
        return { imageUrl: null, fileType: 'unknown' };
      }

      const randomPost = posts[Math.floor(Math.random() * posts.length)];
      
      let imageUrl = null;
      let fileType = 'unknown';
      let chosenUrl = null;

      // Prioritize sample_url for potentially smaller images/thumbnails if available
      if (randomPost.sample && randomPost.sample_url) { 
        chosenUrl = randomPost.sample_url;
        console.log(`Using sample_url for ${characterTag}: ${chosenUrl}`);
      } else if (randomPost.file_url) {
        chosenUrl = randomPost.file_url;
        console.log(`Using file_url for ${characterTag}: ${chosenUrl}`);
      } else {
        console.warn(`No file_url or valid sample_url found in post for ${characterTag}:`, randomPost);
        return { imageUrl: null, fileType: 'unknown' };
      }

      if (chosenUrl.startsWith('//')) {
        imageUrl = 'https:' + chosenUrl;
      } else {
        imageUrl = chosenUrl;
      }
      
      const extension = imageUrl.split('.').pop().toLowerCase().split('?')[0];

      if (['mp4', 'webm', 'mov', 'm4v'].includes(extension)) { 
        fileType = 'video';
      } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff'].includes(extension)) { 
        fileType = 'image';
      } else {
        fileType = 'unknown';
        console.warn(`Could not determine file type from extension '${extension}' for URL: ${imageUrl}`);
      }
      
      console.log(`Selected media for ${characterTag}: ${imageUrl}, Type: ${fileType} (Preference: ${originalMediaTypePreference})`);
      return { imageUrl, fileType };

    } else {
      console.warn(`No posts found or unexpected API response for tag: ${characterTag} (Preference: ${originalMediaTypePreference})`);
      return { imageUrl: null, fileType: 'unknown' };
    }
  } catch (error) {
    if (error.response) {
      console.error(`Error fetching media from rule34.xxx for tags "${fullTags}": Status ${error.response.status}`);
    } else if (error.request) {
      console.error(`Error fetching media from rule34.xxx for tags "${fullTags}": No response received (timeout or network issue)`);
    } else {
      console.error(`Error fetching media from rule34.xxx for tags "${fullTags}":`, error.message);
    }
    return { imageUrl: null, fileType: 'unknown' };
  }
}

// --- New Helper Function for Personalized Selection (Refactored) ---
async function getPersonalizedCharacter(availableChars, userId, recentlyServedSet, excludeIdsSet) {
  if (!userId) {
    // Fallback to simple random if no userId
    if (availableChars.length === 0) return null;
    console.log('[Personalization] No userId, selecting randomly.');
    return availableChars[Math.floor(Math.random() * availableChars.length)];
  }

  try {
    const preferencesSnapshot = await admin.firestore()
      .collection('users').doc(userId)
      .collection('tagPreferences').get();

    if (preferencesSnapshot.empty) {
      console.log(`[Personalization] No preferences found for user ${userId}. Falling back to random.`);
      if (availableChars.length === 0) return null;
      return availableChars[Math.floor(Math.random() * availableChars.length)];
    }

    const userPreferences = {};
    preferencesSnapshot.forEach(doc => {
      userPreferences[doc.id] = doc.data().affinityScore || 0;
    });
    console.log(`[Personalization] Preferences for user ${userId}:`, userPreferences);

    const smashedChars = [];
    const otherChars = [];
    availableChars.forEach(charObj => {
      const affinity = userPreferences[charObj.name] || 0;
      if (affinity > 0) {
        smashedChars.push({ ...charObj, affinityScore: affinity });
      } else {
        otherChars.push(charObj);
      }
    });

    const pickRandomly = (list) => {
      if (!list || list.length === 0) return null;
      return list[Math.floor(Math.random() * list.length)];
    };

    const pickWeightedSmashed = (list) => {
      if (!list || list.length === 0) return null;
      const baseSmashedWeight = 1.0; // Base weight for any smashed item
      const smashedAffinityFactor = 0.5; // Multiplier for affinity score

      let weightedItems = list.map(item => {
        let weight = baseSmashedWeight + (item.affinityScore * smashedAffinityFactor);
        weight = Math.max(0.1, weight); // Ensure a minimum chance
        return { ...item, weight };
      });

      const totalWeight = weightedItems.reduce((sum, item) => sum + item.weight, 0);
      if (totalWeight === 0) {
        // Should not happen if Math.max(0.1) is used and list is not empty
        return pickRandomly(list); 
      }

      let randomVal = Math.random() * totalWeight;
      for (const item of weightedItems) {
        randomVal -= item.weight;
        if (randomVal <= 0) return item;
      }
      return pickRandomly(list); // Fallback, should be rare
    };

    const EXPLORE_OTHER_TAG_RATE = 0.8; // 80% chance to pick from 'otherChars'
    let chosenChar = null;

    if (Math.random() < EXPLORE_OTHER_TAG_RATE) {
      console.log(`[Personalization] User ${userId}: Trying 80% path (other tags).`);
      chosenChar = pickRandomly(otherChars);
      if (chosenChar) {
        console.log(`[Personalization] User ${userId}: Picked from otherChars: ${chosenChar.name}`);
      } else {
        console.log(`[Personalization] User ${userId}: otherChars empty, falling back to smashedChars.`);
        chosenChar = pickWeightedSmashed(smashedChars);
        if (chosenChar) console.log(`[Personalization] User ${userId}: Picked from smashedChars (fallback): ${chosenChar.name}`);
      }
    } else {
      console.log(`[Personalization] User ${userId}: Trying 20% path (smashed tags).`);
      chosenChar = pickWeightedSmashed(smashedChars);
      if (chosenChar) {
        console.log(`[Personalization] User ${userId}: Picked from smashedChars: ${chosenChar.name}`);
      } else {
        console.log(`[Personalization] User ${userId}: smashedChars empty, falling back to otherChars.`);
        chosenChar = pickRandomly(otherChars);
        if (chosenChar) console.log(`[Personalization] User ${userId}: Picked from otherChars (fallback): ${chosenChar.name}`);
      }
    }

    if (!chosenChar) {
      console.log(`[Personalization] User ${userId}: Categories yielded no result, final fallback to random from all available.`);
      chosenChar = pickRandomly(availableChars); // availableChars here still has original structure
      if (chosenChar) console.log(`[Personalization] User ${userId}: Picked from all available (final fallback): ${chosenChar.name}`);
    }
    
    // Ensure chosenChar, if exists, doesn't have temporary properties like 'affinityScore' or 'weight' that are not part of original charObj structure
    if (chosenChar) {
        const { affinityScore, weight, ...originalCharObj } = chosenChar;
        return originalCharObj;
    }

    return null; // If availableChars was empty to begin with

  } catch (error) {
    console.error(`[Personalization] Error in getPersonalizedCharacter for user ${userId}:`, error);
    // Fallback to simple random on error
    if (availableChars.length === 0) return null;
    return availableChars[Math.floor(Math.random() * availableChars.length)];
  }
}

// Endpoint to get a list of characters with pagination
characterRouter.get('/', async (req, res) => {
  const seed = req.query.seed || 'default';
  
  if (!req.query.media_type) {
    return res.status(400).json({ message: 'Media type preference is required' });
  }

  try {
    let allCharacters = await initializeCharacterCache();
    let shuffledCharacters = seededShuffle([...allCharacters], seed);
    
    // Apply personalization to shuffled list
    const userId = req.query.userId;
    if (userId && typeof applyPersonalization === 'function') {
      shuffledCharacters = applyPersonalization(shuffledCharacters, userId) || shuffledCharacters;
    }

    const excludeIdsQuery = req.query.exclude_ids;
    let excludedNamesSet = new Set();
    if (excludeIdsQuery) {
      excludedNamesSet = new Set(excludeIdsQuery.split(',').map(name => name.trim()).filter(name => name));
      console.log('[GET /characters] Excluding names:', Array.from(excludedNamesSet));
      shuffledCharacters = shuffledCharacters.filter(charData => !excludedNamesSet.has(charData.name));
    }

    const blacklistQuery = req.query.blacklisted_tags;
    if (blacklistQuery) {
      const blacklistedSet = new Set(blacklistQuery.split(',').map(tag => tag.trim()).filter(tag => tag));
      console.log('[GET /characters] Excluding blacklisted tags:', Array.from(blacklistedSet));
      shuffledCharacters = shuffledCharacters.filter(charData => !blacklistedSet.has(charData.name));
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const paginatedCharacterData = shuffledCharacters.slice(startIndex, endIndex);

    // Prepare blacklisted tags for media fetching
    const blacklistQueryForMedia = req.query.blacklisted_tags;
    let blacklistedTagsForMedia = [];
    if (blacklistQueryForMedia) {
      blacklistedTagsForMedia = blacklistQueryForMedia.split(',').map(tag => tag.trim()).filter(tag => tag);
    }

    const charactersWithMedia = await Promise.all(
      paginatedCharacterData.map(async (charData) => {
        const mediaInfo = await fetchRule34Image(charData.name, blacklistedTagsForMedia, req.query.media_type);
        return {
          name: formatCharacterName(charData.name),
          originalTag: charData.name,
          sourceCount: charData.count,
          imageUrl: mediaInfo.imageUrl,
          fileType: mediaInfo.fileType
        };
      })
    );

    res.json({
      characters: charactersWithMedia,
      currentPage: page,
      totalPages: Math.ceil(shuffledCharacters.length / limit), // Total pages based on (potentially filtered) list
      totalCharactersInSystem: allCharacters.length, // Report original total for frontend's 'seen all' logic
    });
  } catch (error) {
    console.error('[CharacterRouter] Error in GET /characters:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Endpoint to get a random character
characterRouter.get('/random', async (req, res) => {
  if (!req.query.media_type) {
    return res.status(400).json({ message: 'Media type preference is required' });
  }

  if (!characterCache || characterCache.length === 0) {
    const currentCache = await initializeCharacterCache(); 
    if (!currentCache || currentCache.length === 0) {
        return res.status(503).json({ message: 'Character cache is not available. Please try again shortly.' });
    }
  }

  const { exclude_ids, userId, blacklisted_tags } = req.query;
  const excludeIdsArray = exclude_ids ? exclude_ids.split(',') : [];
  const blacklistedTagsArray = blacklisted_tags ? blacklisted_tags.split(',') : [];

  console.log(`[CharacterRouter /random] Received request. Exclude IDs: ${excludeIdsArray.length}, UserID: ${userId}, BlacklistedTags: ${blacklistedTagsArray.length}, MediaType: ${req.query.media_type}`);

  let excludedNamesSet = new Set();
  if (exclude_ids) {
    excludedNamesSet = new Set(exclude_ids.split(',').map(name => name.trim()).filter(name => name));
  }

  const blacklistQuery = req.query.blacklisted_tags;
  let blacklistedSet = new Set();
  if (blacklistQuery) {
    blacklistedSet = new Set(blacklistQuery.split(',').map(tag => tag.trim()).filter(tag => tag));
    console.log(`[Random Endpoint] Excluding blacklisted tags: ${Array.from(blacklistedSet)}`);
  }

  // Filter out recently served, excluded, and blacklisted characters
  let availableCharacters = characterCache.filter(charData => 
    !recentlyServedCharacterNames.includes(charData.name) && 
    !excludedNamesSet.has(charData.name) &&
    !blacklistedSet.has(charData.name)
  );

  if (availableCharacters.length === 0) {
    // If all characters are excluded or recently served, try resetting recentlyServed for this request's available pool
    // This is a fallback to prevent getting stuck if exclude_ids covers everything not recently served.
    console.log('[Random Endpoint] All characters excluded or recently served. Considering reset of recentlyServed for this request.');
    const tempRecentlyServed = [...recentlyServedCharacterNames]; // Keep a copy
    recentlyServedCharacterNames = []; // Temporarily clear for this request's available pool
    availableCharacters = characterCache.filter(charData => 
        !excludedNamesSet.has(charData.name) &&
        !blacklistedSet.has(charData.name)
    );
    if (availableCharacters.length === 0) {
        // If still no characters after clearing recently served (e.g. exclude_ids is everything)
        recentlyServedCharacterNames = tempRecentlyServed; // Restore for next time
        return res.status(404).json({ message: 'No characters available based on exclusions.' });
    }
    // If characters became available, proceed, but don't permanently clear recentlyServedCharacterNames here.
    // It will be repopulated by the chosen character.
    // The original recentlyServedCharacterNames will be used for the next non-empty request.
  }

  let selectedCharacterData = null;
  if (userId) {
    console.log(`[Random Endpoint] Attempting personalized selection for user ${userId}`);
    selectedCharacterData = await getPersonalizedCharacter(availableCharacters, userId, new Set(recentlyServedCharacterNames), excludedNamesSet);
  } else {
    console.log('[Random Endpoint] No userId provided, using standard random selection.');
    if (availableCharacters.length > 0) {
      selectedCharacterData = availableCharacters[Math.floor(Math.random() * availableCharacters.length)];
    }
  }

  if (!selectedCharacterData) {
    // This can happen if availableCharacters was empty or getPersonalizedCharacter returned null
    return res.status(404).json({ message: 'Failed to select a character. All may have been seen or an error occurred.' });
  }

  // Fetch media for the selected character, including blacklist
  const blacklistQueryForMediaRandom = req.query.blacklisted_tags;
  let blacklistedTagsForMediaRandom = [];
  if (blacklistQueryForMediaRandom) {
    blacklistedTagsForMediaRandom = blacklistQueryForMediaRandom.split(',').map(tag => tag.trim()).filter(tag => tag);
  }

  let mediaInfo = await fetchRule34Image(selectedCharacterData.name, blacklistedTagsForMediaRandom, req.query.media_type);
  let attempts = 0;
  const maxAttempts = 3; // Max attempts to find a character with valid media

  while (!mediaInfo || !mediaInfo.imageUrl) {
    console.warn(`Media fetch failed for ${selectedCharacterData.name}. Attempting to select another character.`);
    // Add to recently served to avoid picking it again immediately in the retry
    if (recentlyServedCharacterNames.length >= RECENTLY_SERVED_MAX_SIZE) {
        recentlyServedCharacterNames.shift();
    }
    recentlyServedCharacterNames.push(selectedCharacterData.name);
    
    // Try to get a new character
    const tempExcludeIdsSet = new Set([...excludeIdsArray, ...recentlyServedCharacterNames]);
    const nextAvailableChars = characterCache.filter(charObj => !tempExcludeIdsSet.has(charObj.name));
    
    if (nextAvailableChars.length === 0) {
      return res.status(404).json({ message: 'No alternative characters available after media fetch failure.' });
    }
    selectedCharacterData = await getPersonalizedCharacter(nextAvailableChars, userId, new Set(recentlyServedCharacterNames), tempExcludeIdsSet) || nextAvailableChars[Math.floor(Math.random() * nextAvailableChars.length)];
    
    if (!selectedCharacterData) {
      return res.status(404).json({ message: 'Failed to select an alternative character.' });
    }
    mediaInfo = await fetchRule34Image(selectedCharacterData.name, blacklistedTagsForMediaRandom, req.query.media_type);
    attempts++;
    if (attempts >= maxAttempts) {
      console.error(`Media fetch failed again for ${selectedCharacterData.name}. Returning error.`);
      return res.status(502).json({ message: 'Failed to fetch media for selected character after retry.' });
    }
  }
  
  // Update recently served list with the successfully chosen character's raw name
  if (recentlyServedCharacterNames.length >= RECENTLY_SERVED_MAX_SIZE) {
    recentlyServedCharacterNames.shift();
  }
  recentlyServedCharacterNames.push(selectedCharacterData.name); // Use the name from the final selectedCharacterData

  res.json({
    character: {
      name: formatCharacterName(selectedCharacterData.name),
      originalTag: selectedCharacterData.name, // Send the original tag for preference tracking
      sourceCount: selectedCharacterData.count, // from popular_character_tags.json
      imageUrl: mediaInfo.imageUrl,
      fileType: mediaInfo.fileType
    },
    totalCharacters: characterCache.length // Total unique tags in cache
  });
});

// Endpoint for batch fetching random characters
characterRouter.get('/random/batch', async (req, res) => {
  if (!req.query.media_type) {
    return res.status(400).json({ message: 'Media type preference is required' });
  }

  if (!characterCache || characterCache.length === 0) {
    await initializeCharacterCache();
    if (!characterCache || characterCache.length === 0) {
      return res.status(503).json({ message: 'Character cache is not available. Please try again shortly.' });
    }
  }

  const count = parseInt(req.query.count, 10) || 5;
  const { exclude_ids, userId, blacklisted_tags } = req.query;
  const excludeIdsArray = exclude_ids ? exclude_ids.split(',') : [];
  const blacklistedTagsArray = blacklisted_tags ? blacklisted_tags.split(',') : [];

  console.log(`[CharacterRouter /random/batch] Request for ${count} characters. Exclude IDs: ${excludeIdsArray.length}, UserID: ${userId}, BlacklistedTags: ${blacklistedTagsArray.length}, MediaType: ${req.query.media_type}`);

  const recentlyServedSet = new Set(recentlyServedCharacterNames);
  const excludeIdsSet = new Set(exclude_ids ? exclude_ids.split(',') : []);

  let availableChars = characterCache.filter(charObj => 
    !excludeIdsSet.has(charObj.name) && !recentlyServedSet.has(charObj.name)
  );

  if (availableChars.length === 0) {
    // If initial filtering results in no characters, try resetting recentlyServed for this batch call context
    // This is to prevent getting stuck if all chars were recently served but are needed for a batch
    console.log('[CharacterRouter /random/batch] No characters available with recentlyServed exclusion. Trying without it for this batch.');
    availableChars = characterCache.filter(charObj => !excludeIdsSet.has(charObj.name));
    if (availableChars.length === 0) {
      return res.status(404).json({ message: 'No characters available based on exclusions for batch.' });
    }
  }

  const selectedCharactersData = [];
  const newSeenInThisBatch = new Set(); // To avoid duplicates within the same batch

  for (let i = 0; i < count && availableChars.length > 0; i++) {
    let candidateCharacter = await getPersonalizedCharacter(availableChars, userId, new Set([...recentlyServedSet, ...newSeenInThisBatch]), excludeIdsSet);
    if (!candidateCharacter) {
        // Fallback if personalization yields nothing from the current available set
        candidateCharacter = availableChars[Math.floor(Math.random() * availableChars.length)];
    }

    if (!candidateCharacter) continue; // Should not happen if availableChars is not empty

    // Fetch media for the candidate
    const mediaInfo = await fetchRule34Image(candidateCharacter.name, blacklistedTagsArray, req.query.media_type);

    if (mediaInfo && mediaInfo.imageUrl) {
      selectedCharactersData.push({
        ...candidateCharacter,
        displayName: formatCharacterName(candidateCharacter.name),
        mediaUrl: mediaInfo.imageUrl,
        fileType: mediaInfo.fileType,
        tags: candidateCharacter.tags ? candidateCharacter.tags.split(' ') : [],
      });
      newSeenInThisBatch.add(candidateCharacter.name);
      // Remove the selected character from availableChars for the next iteration of this loop
      availableChars = availableChars.filter(char => char.name !== candidateCharacter.name);
    } else {
      console.warn(`[CharacterRouter /random/batch] Media fetch failed for ${candidateCharacter.name}. Skipping for this batch.`);
      // Optionally, try another character instead of just skipping, but that can complicate batch size guarantees.
      // For now, we just try to fill the batch with characters that DO have media.
      // To avoid getting stuck on this character in this loop, remove it.
      availableChars = availableChars.filter(char => char.name !== candidateCharacter.name);
      i--; // Decrement i to try to fetch another character to meet the count
    }
  }

  if (selectedCharactersData.length === 0 && count > 0) {
    return res.status(404).json({ message: 'Could not fetch media for any selected characters in batch.' });
  }

  // Update global recently served list with characters successfully served in this batch
  selectedCharactersData.forEach(char => {
    if (recentlyServedCharacterNames.length >= RECENTLY_SERVED_MAX_SIZE) {
      recentlyServedCharacterNames.shift();
    }
    recentlyServedCharacterNames.push(char.name);
  });

  res.json({
    characters: selectedCharactersData,
    totalCharacters: characterCache.length, // This might be better as total *available* after initial filters
  });
});

// New personalization apply function
function applyPersonalization(characters, userId) {
  // Basic implementation to prevent undefined errors
  if (!userId || !Array.isArray(characters)) return characters;
  
  // Add actual personalization logic here
  return characters; // Return original array as fallback
}

module.exports = {
  characterRouter,
  initializeCharacterCache
};
