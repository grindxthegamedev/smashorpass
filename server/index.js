const express = require('express');
const cors = require('cors'); // Import cors
const tagRouter = require('./routes/tagRouter');
const { characterRouter, initializeCharacterCache } = require('./routes/characterRouter'); 
const { initializeFirebaseAdmin } = require('./services/firebaseAdmin'); // Import Firebase Admin initializer
const userRouter = require('./routes/userRouter'); // Import user router

const app = express();
const PORT = process.env.PORT || 3001; // Backend server port

// Enable CORS for all routes
app.use(cors());

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Firebase Admin SDK on server start
initializeFirebaseAdmin();

// Mount routers
app.use('/api/tags', tagRouter); 
app.use('/api/characters', characterRouter); // Mount character router
app.use('/api/users', userRouter); // Mount the user router

// Basic route for server health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'UP', message: 'Server is running' });
});

// Global error handler (optional, but good practice)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

async function startServer() {
  try {
    console.log('Initializing character cache...');
    await initializeCharacterCache(); // Wait for the cache to be populated
    console.log('Character cache initialized successfully.');

    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
      console.log(`  Tag scraping: http://localhost:${PORT}/api/tags/all-top-tags`);
      console.log(`  Get characters (paginated): http://localhost:${PORT}/api/characters?page=1&limit=5`);
      console.log(`  Get random character: http://localhost:${PORT}/api/characters/random`);
      console.log(`  POST /api/users/register`); // Added new route info
    });
  } catch (error) {
    console.error('Failed to initialize character cache or start server:', error);
    process.exit(1); // Exit if server can't start properly
  }
}

startServer();

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
