const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB, dbPromise } = require('./database');
const { getNextQuestion, submitSwipe, getLeaderboard } = require('./queries');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Securely serve the frontend root folder WITHOUT serving the backend folder
app.use('/backend', (req, res) => res.status(403).send('Forbidden'));
app.use(express.static(path.join(__dirname, '../')));

app.get('/next-question', async (req, res) => {
  try {
    const sessionId = req.query.session_id;
    if (!sessionId) {
      return res.status(400).json({ error: 'session_id is required' });
    }
    const result = await getNextQuestion(sessionId);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/submit-swipe', async (req, res) => {
  try {
    const { session_id, senior_id, trait_id, response } = req.body;
    if (!session_id || !senior_id || !trait_id || !response) {
      return res.status(400).json({ error: 'Missing fields in request body' });
    }
    await submitSwipe(session_id, senior_id, trait_id, response);
    res.json({ success: true });
  } catch (error) {
    if (error.message === 'Duplicate response' || error.message === 'Invalid response') {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/leaderboard', async (req, res) => {
  try {
    const traitId = req.query.trait_id || null;
    const leaderboard = await getLeaderboard(traitId);
    res.json(leaderboard);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/traits', async (req, res) => {
  try {
    const db = await dbPromise;
    const traits = await db.all('SELECT * FROM traits');
    res.json(traits);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/seniors', async (req, res) => {
  try {
    const db = await dbPromise;
    const seniors = await db.all('SELECT * FROM seniors');
    res.json(seniors);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/senior/:id', async (req, res) => {
  try {
    const db = await dbPromise;
    const senior = await db.get('SELECT * FROM seniors WHERE id = ?', [req.params.id]);
    if (!senior) {
      return res.status(404).json({ error: 'Senior not found' });
    }
    res.json(senior);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Initialize DB and start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}).catch(console.error);
