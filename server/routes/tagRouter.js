const express = require('express');
const fs = require('fs').promises; // For file system operations
const path = require('path'); // For path manipulation
const scrapeUrl = require('../utils/scraper');
const tagRouter = express.Router();

const baseTagListUrl = "https://rule34.xxx/index.php?page=tags&s=list";
const tagsPerPageForPid = 20;
const popularCharacterTagsFilePath = path.join(__dirname, '..', 'data', 'popular_character_tags.json');
const MAX_TOP_TAGS = 750;

function extractTagsFromPage($, filterForCharacter = false) {
  if (!$) {
    console.log("extractTagsFromPage: Cheerio object is null, returning empty array.");
    return [];
  }
  const tags = [];
  $('table[class="highlightable"] tr').each(function() {
    const row = $(this);
    const columns = row.find('td');

    if (columns.length === 3) {
      const countText = $(columns[0]).text().trim();
      const nameWithPlus = $(columns[1]).text().trim();
      const typesText = $(columns[2]).text().trim();

      const cleanedName = nameWithPlus.replace(/^\s*\+\s*/, '').replace(/\s+/g, '_');
      const types = typesText.replace(/\(edit\)/gi, '').split(',').map(type => type.trim().toLowerCase()).filter(type => type.length > 0);
      const postCount = parseInt(countText.replace(/,/g, ''), 10) || 0;

      if (cleanedName) {
        const isCharacterTag = types.includes('character');
        if (filterForCharacter && !isCharacterTag) {
          // If filtering for characters and this is not one, skip it
          return; // Skips to the next iteration of .each()
        }
        tags.push({
          name: cleanedName,
          types: types, // Store original types array
          posts: postCount,
          isCharacter: isCharacterTag // Add a flag for convenience
        });
      }
    }
  });
  // console.log(`extractTagsFromPage: Extracted ${tags.length} tags (filterForCharacter: ${filterForCharacter}).`);
  return tags;
}

// Route to get tags based on query parameters (e.g., for specific tag searches)
tagRouter.get("/", async function(req, res) {
  try {
    let url = baseTagListUrl;
    console.log("GET /tags (search) - Query params:", req.query);

    if (req.query.name) {
      url += "&tags=" + encodeURIComponent(req.query.name);
    }
    if (req.query.sort) {
      url += "&sort=" + encodeURIComponent(req.query.sort);
    }
    if (req.query.order_by) {
      let translated;
      switch (req.query.order_by.toLowerCase()) {
        case "name": translated = "tag"; break;
        case "posts": translated = "index_count"; break;
        default: translated = req.query.order_by;
      }
      url += "&order_by=" + encodeURIComponent(translated);
    }
    console.log("GET /tags (search) - Scraping URL:", url);
    const $ = await scrapeUrl(url);
    if (!$) {
      console.error("GET /tags (search) - Failed to get Cheerio object for URL:", url);
      return res.status(500).json({ error: "Failed to scrape data from the source." });
    }

    // For the generic search, we don't pre-filter for characters unless specified by query.type
    let tags = extractTagsFromPage($, false); 
    console.log(`GET /tags (search) - Initially extracted ${tags.length} tags.`);

    if (req.query.type) {
      const filterType = req.query.type.toLowerCase();
      tags = tags.filter(tag => tag.types.some(t => t.toLowerCase() === filterType));
      console.log(`GET /tags (search) - After type filter ('${filterType}'), ${tags.length} tags remaining.`);
    }

    if (req.query.limit) {
      const limit = parseInt(req.query.limit, 10);
      if (!isNaN(limit) && limit > 0 && limit < tags.length) {
        tags.length = limit;
        console.log(`GET /tags (search) - After limit filter (${limit}), ${tags.length} tags remaining.`);
      }
    }
    res.json(tags);
  } catch (err) {
    console.error("Error in GET /tags (search) route:", err);
    res.status(500).json({ error: "An internal server error occurred.", details: err.message });
  }
});

// Route to scrape the most popular CHARACTER tags from the first N pages and save to file
tagRouter.get("/all-top-tags", async function(req, res) {
  try {
    const totalPagesToScrape = 1000; // Kept at 2 for testing
    console.log(`Starting scrape for /all-top-tags (most popular CHARACTER tags, first ${totalPagesToScrape} pages)...`);
    const allCharacterTags = [];
    let pagesScrapedSuccessfully = 0;

    for (let i = 0; i < totalPagesToScrape; i++) {
      const pid = i * tagsPerPageForPid;
      const pageUrl = `${baseTagListUrl}&order_by=index_count&sort=desc&pid=${pid}`;
      
      console.log(`Scraping popular character tags - page ${i + 1}/${totalPagesToScrape} (pid: ${pid}) from URL: ${pageUrl}`);
      const $ = await scrapeUrl(pageUrl);
      
      if ($) {
        // Pass true to filter for character tags
        const characterTagsFromPage = extractTagsFromPage($, true);
        console.log(`Popular character tags - page ${i + 1}: Found ${characterTagsFromPage.length} character tags.`);
        allCharacterTags.push(...characterTagsFromPage);
        pagesScrapedSuccessfully++;
        if (allCharacterTags.length >= MAX_TOP_TAGS) {
          console.log(`Collected ${allCharacterTags.length} character tags; stopping at ${MAX_TOP_TAGS}.`);
          break;
        }
      } else {
        console.warn(`Popular character tags - page ${i + 1} (pid: ${pid}): Cheerio object was null. Skipping.`);
      }

      if (i < totalPagesToScrape - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    console.log(`Finished scraping popular character tags. Total pages attempted: ${totalPagesToScrape}. Successfully scraped: ${pagesScrapedSuccessfully}. Total character tags collected: ${allCharacterTags.length}`);

    if (allCharacterTags.length > MAX_TOP_TAGS) {
      allCharacterTags.splice(MAX_TOP_TAGS);
      console.log(`Trimmed collected character tags to ${MAX_TOP_TAGS}.`);
    }

    if (allCharacterTags.length > 0) {
      try {
        await fs.writeFile(popularCharacterTagsFilePath, JSON.stringify(allCharacterTags, null, 2));
        console.log(`Successfully saved ${allCharacterTags.length} popular character tags to ${popularCharacterTagsFilePath}`);
      } catch (writeError) {
        console.error(`Error writing popular character tags to file ${popularCharacterTagsFilePath}:`, writeError);
      }
    } else {
      console.log('No popular character tags collected, so nothing to write to file.');
    }

    res.json({ 
      message: `Scraped ${pagesScrapedSuccessfully}/${totalPagesToScrape} pages of popular character tags.`, 
      totalTags: allCharacterTags.length, 
      tagsFilePath: allCharacterTags.length > 0 ? popularCharacterTagsFilePath : null,
      tags: allCharacterTags 
    });

  } catch (err) {
    console.error("Error in /all-top-tags (popular character) route:", err);
    res.status(500).json({ error: "An internal server error occurred while scraping popular character tags.", details: err.message });
  }
});

module.exports = tagRouter;
