# Personalization Workflow

**Goal:** Tailor the characters/posts shown to a user based on their past interactions (smashes and passes) to increase engagement and user satisfaction.

## I. Data Collection & Storage (User Preferences)

1.  **Track Interactions:**
    *   When a user "smashes" a character, record this as a positive interaction for the character's primary tag.
    *   When a user "passes" a character, record this as a negative interaction for the character's primary tag.

2.  **Storage (Firestore):**
    *   For each user, create a subcollection: `users/{userId}/tagPreferences`.
    *   Each document in `tagPreferences` will represent a character tag (e.g., `goku_(dragon_ball)`).
    *   **Document Structure for `tagPreferences/{tagId}`:**
        *   `tagName`: `string` (e.g., "goku_(dragon_ball)") - The original tag.
        *   `smashCount`: `number` (default 0) - Incremented on smash.
        *   `passCount`: `number` (default 0) - Incremented on pass.
        *   `lastInteractedAt`: `Timestamp` - Timestamp of the last interaction with this tag.
        *   `affinityScore`: `number` (calculated, e.g., `smashCount - passCount` or a weighted version).

## II. Backend: Personalization Logic (Server-Side - `characterRouter.js`)

1.  **Fetch User Preferences:**
    *   When a logged-in user requests characters, the server will need the `userId`. This could be passed in the request or derived from an authenticated session/token.
    *   Fetch the user's `tagPreferences` from Firestore.

2.  **Modify Character Selection (`/api/characters` or `/api/characters/random`):**
    *   **Current:** Shuffles a global list of character tags from `popular_character_tags.json`.
    *   **New Approach (Weighted Selection):**
        1.  Start with the global `characterCache` (shuffled list of all available tags).
        2.  For each tag in `characterCache`, calculate a weight:
            *   If the user has preferences for this tag:
                *   `weight = baseWeight + (affinityScore * personalizationFactor)`
                *   `personalizationFactor` can be a configurable value to control how strongly preferences influence selection.
            *   If the user has no preference for this tag:
                *   `weight = baseWeight` (neutral)
            *   Ensure weights are non-negative. Tags with high negative affinity might get a very low or zero weight.
        3.  Perform a weighted random selection from the `characterCache` to pick the next character tag.
        4.  Continue to use `recentlyServedCharacterNames` to avoid immediate repeats.

3.  **Exploration vs. Exploitation:**
    *   To prevent users from getting stuck in a filter bubble, ensure a chance for "exploration."
    *   For example, 80% of the time, use weighted selection (exploitation). 20% of the time, pick a character randomly from the global pool, ignoring preferences (exploration), or pick from tags the user hasn't interacted with yet.

## III. Backend: API Endpoint for Recording Preferences

1.  **Create New Endpoint:** `POST /api/users/preferences/interact`
    *   **Request Body:**
        *   `userId`: `string`
        *   `characterTag`: `string` (the original tag of the character interacted with)
        *   `interactionType`: `string` ("smash" or "pass")
    *   **Logic:**
        1.  Validate input.
        2.  Find or create the document for `characterTag` in `users/{userId}/tagPreferences`.
        3.  Increment `smashCount` or `passCount`.
        4.  Update `lastInteractedAt`.
        5.  Recalculate and update `affinityScore`.
        6.  Use a Firestore transaction or batch write if updating multiple fields.

## IV. Frontend Changes (e.g., `SwipePage.jsx`)

1.  **Send Interaction Data:**
    *   After a user smashes or passes a character, call the new `POST /api/users/preferences/interact` endpoint with the `userId`, the character's original tag, and the type of interaction.
    *   The `userId` should be available from `AuthContext`.
    *   The character's original tag should be available in the character data fetched from the backend (ensure `characterRouter.js` provides this, e.g., as `originalTag`).

## V. Key Considerations & Future Enhancements

1.  **Cold Start:** For new users or users with few interactions, the system will behave similarly to the non-personalized version (mostly `baseWeight`).
2.  **Affinity Score Calculation:** Start simple (e.g., `smashes - passes`). Can be refined later (e.g., logarithmic scaling, time decay).
3.  **Performance:** Fetching preferences for every request needs to be efficient. Firestore's direct document access should be performant.
4.  **UI for Personalization Management (Optional Future):**
    *   Allow users to see a list of their liked/disliked tags.
    *   Option to "reset" personalization data.
5.  **Tag Granularity:** Initially, personalization is based on the main character tag. Future enhancements could involve breaking down character tags into sub-tags (e.g., series, hair color, attributes) for more nuanced personalization, but this adds significant complexity.
6.  **Batching Interactions:** If users swipe very quickly, consider batching interaction updates on the frontend before sending to the backend to reduce API calls, though individual calls are likely fine for now.

This workflow provides a solid foundation for implementing personalization.
