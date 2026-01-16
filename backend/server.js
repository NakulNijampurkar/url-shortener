import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { nanoid } from 'nanoid';
import db from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create tables if they don't exist
const createTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS urls (
      id INT AUTO_INCREMENT PRIMARY KEY,
      original_url VARCHAR(2048) NOT NULL,
      short_code VARCHAR(20) UNIQUE NOT NULL,
      clicks INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_short_code (short_code)
    )
  `;
  
  try {
    await db.query(createTableQuery);
    console.log('URLs table ready');
  } catch (error) {
    console.error('Error creating table:', error);
  }
};

createTable();

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Shorten URL
app.post('/api/shorten', async (req, res) => {
  try {
    const { url } = req.body;

    // Validate URL
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Check if URL already exists
    const [existing] = await db.query(
      'SELECT * FROM urls WHERE original_url = ?',
      [url]
    );

    if (existing.length > 0) {
      const existingUrl = existing[0];
      return res.json({
        success: true,
        data: {
          originalUrl: existingUrl.original_url,
          shortUrl: `${process.env.BASE_URL}/${existingUrl.short_code}`,
          shortCode: existingUrl.short_code,
          clicks: existingUrl.clicks,
          createdAt: existingUrl.created_at
        }
      });
    }

    // Generate unique short code
    let shortCode = nanoid(6);
    
    // Ensure uniqueness
    let [codeExists] = await db.query(
      'SELECT id FROM urls WHERE short_code = ?',
      [shortCode]
    );
    
    while (codeExists.length > 0) {
      shortCode = nanoid(6);
      [codeExists] = await db.query(
        'SELECT id FROM urls WHERE short_code = ?',
        [shortCode]
      );
    }

    // Insert into database
    await db.query(
      'INSERT INTO urls (original_url, short_code) VALUES (?, ?)',
      [url, shortCode]
    );

    const shortUrl = `${process.env.BASE_URL}/${shortCode}`;

    res.status(201).json({
      success: true,
      data: {
        originalUrl: url,
        shortUrl: shortUrl,
        shortCode: shortCode,
        clicks: 0
      }
    });

  } catch (error) {
    console.error('Error shortening URL:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Redirect to original URL
app.get('/:shortCode', async (req, res) => {
  try {
    const { shortCode } = req.params;

    // Get URL from database
    const [results] = await db.query(
      'SELECT * FROM urls WHERE short_code = ?',
      [shortCode]
    );

    if (results.length === 0) {
      return res.status(404).json({ error: 'URL not found' });
    }

    const url = results[0];

    // Increment click count
    await db.query(
      'UPDATE urls SET clicks = clicks + 1 WHERE short_code = ?',
      [shortCode]
    );

    // Redirect to original URL
    res.redirect(url.original_url);

  } catch (error) {
    console.error('Error redirecting:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get analytics for a short URL
app.get('/api/analytics/:shortCode', async (req, res) => {
  try {
    const { shortCode } = req.params;

    const [results] = await db.query(
      'SELECT * FROM urls WHERE short_code = ?',
      [shortCode]
    );

    if (results.length === 0) {
      return res.status(404).json({ error: 'URL not found' });
    }

    const url = results[0];

    res.json({
      success: true,
      data: {
        originalUrl: url.original_url,
        shortUrl: `${process.env.BASE_URL}/${url.short_code}`,
        shortCode: url.short_code,
        clicks: url.clicks,
        createdAt: url.created_at
      }
    });

  } catch (error) {
    console.error('Error getting analytics:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all URLs (recent 20)
app.get('/api/urls', async (req, res) => {
  try {
    const [results] = await db.query(
      'SELECT * FROM urls ORDER BY created_at DESC LIMIT 20'
    );

    const urls = results.map(url => ({
      originalUrl: url.original_url,
      shortUrl: `${process.env.BASE_URL}/${url.short_code}`,
      shortCode: url.short_code,
      clicks: url.clicks,
      createdAt: url.created_at
    }));

    res.json({
      success: true,
      data: urls,
      count: urls.length
    });

  } catch (error) {
    console.error('Error getting URLs:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a URL
app.delete('/api/urls/:shortCode', async (req, res) => {
  try {
    const { shortCode } = req.params;

    const [result] = await db.query(
      'DELETE FROM urls WHERE short_code = ?',
      [shortCode]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'URL not found' });
    }

    res.json({
      success: true,
      message: 'URL deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting URL:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});