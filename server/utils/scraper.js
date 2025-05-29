const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Fetches HTML content from a URL and returns a Cheerio object for parsing.
 * @param {string} url The URL to scrape.
 * @returns {Promise<cheerio.CheerioAPI|null>} A Cheerio API object or null if an error occurs.
 */
async function scrapeUrl(url) {
  console.log(`[Scraper] Attempting to fetch URL: ${url}`);
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        // 'Referer': 'https://rule34.xxx/' // Sometimes helpful
      },
      timeout: 15000 // Increased timeout to 15 seconds
    });
    console.log(`[Scraper] Successfully fetched URL: ${url}. Status: ${response.status}. Content length: ${response.data.length}`);
    
    if (response.data && response.data.length > 0) {
      const $ = cheerio.load(response.data);
      console.log(`[Scraper] Successfully loaded HTML into Cheerio for URL: ${url}`);
      return $;
    } else {
      console.warn(`[Scraper] Fetched URL ${url} but received empty data.`);
      return null;
    }

  } catch (error) {
    console.error(`[Scraper] Error fetching or parsing URL ${url}:`, error.message);
    if (error.response) {
      console.error(`[Scraper] Response Status: ${error.response.status}`);
      // console.error('[Scraper] Response Headers:', error.response.headers); // Can be too verbose
      // console.error('[Scraper] Response Data (snippet):', error.response.data ? String(error.response.data).substring(0, 200) : 'N/A');
    } else if (error.request) {
      console.error('[Scraper] No response received for URL:', url, 'Request details:', error.request);
    } else {
      console.error('[Scraper] Error setting up request for URL:', url, error.message);
    }
    return null;
  }
}

module.exports = scrapeUrl;
