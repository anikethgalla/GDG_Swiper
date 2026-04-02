const { dbPromise } = require('./database');

async function getNextQuestion(sessionId) {
  const db = await dbPromise;

  // 1. Get all possible (senior_id, trait_id) pairs
  // 2. Exclude those the user has already answered in `responses` for this session
  // 3. Of the remaining pairs, find the minimum total_count in `pair_stats`
  // 4. Randomly pick one of those with the minimum total_count

  const query = `
    WITH Unanswered AS (
      SELECT p.senior_id, p.trait_id, p.total_count
      FROM pair_stats p
      LEFT JOIN responses r 
        ON r.senior_id = p.senior_id 
        AND r.trait_id = p.trait_id 
        AND r.session_id = ?
      WHERE r.id IS NULL
    ),
    MinCount AS (
      SELECT MIN(total_count) as min_total FROM Unanswered
    )
    SELECT u.senior_id, u.trait_id, s.name, s.alias, s.caricature_id, t.question_text
    FROM Unanswered u
    JOIN MinCount m ON u.total_count = m.min_total
    JOIN seniors s ON u.senior_id = s.id
    JOIN traits t ON u.trait_id = t.id
    ORDER BY RANDOM()
    LIMIT 1;
  `;

  const question = await db.get(query, [sessionId]);
  if (!question) {
    return { done: true };
  }
  return question;
}

async function submitSwipe(sessionId, seniorId, traitId, responseStr) {
  const db = await dbPromise;
  
  // ensure valid response
  if (!['yes', 'no', 'maybe', 'skip'].includes(responseStr)) {
    throw new Error('Invalid response');
  }

  // Insert response
  try {
    await db.run(
      'INSERT INTO responses (session_id, senior_id, trait_id, response) VALUES (?, ?, ?, ?)',
      [sessionId, seniorId, traitId, responseStr]
    );
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      // User already submitted this pair.
      throw new Error('Duplicate response');
    }
    throw err;
  }

  // Update stats
  let countCol = '';
  if (responseStr === 'yes') countCol = 'yes_count';
  else if (responseStr === 'no') countCol = 'no_count';
  else if (responseStr === 'maybe') countCol = 'maybe_count';

  if (countCol) {
    await db.run(`
      UPDATE pair_stats 
      SET ${countCol} = ${countCol} + 1, total_count = total_count + 1
      WHERE senior_id = ? AND trait_id = ?
    `, [seniorId, traitId]);
  } else {
    // skip also counts as a response for coverage, but doesn't increment yes/no/maybe
    await db.run(`
      UPDATE pair_stats 
      SET total_count = total_count + 1
      WHERE senior_id = ? AND trait_id = ?
    `, [seniorId, traitId]);
  }
}

async function getLeaderboard(traitId = null) {
  const db = await dbPromise;

  let query = `
    SELECT 
      s.id, s.name, s.alias, s.caricature_id,
      SUM(p.yes_count) as total_yes,
      SUM(p.no_count) as total_no,
      SUM(p.maybe_count) as total_maybe,
      (SUM(p.yes_count) - (0.5 * SUM(p.maybe_count))) as score
    FROM seniors s
    JOIN pair_stats p ON s.id = p.senior_id
  `;
  
  let params = [];
  if (traitId) {
    query += ` WHERE p.trait_id = ? `;
    params.push(traitId);
  }

  query += `
    GROUP BY s.id
    ORDER BY score DESC
    LIMIT 3
  `;

  const rows = await db.all(query, params);
  
  // Assign crowns
  const crowns = ['gold', 'silver', 'bronze'];
  const leaderboard = rows.map((row, index) => ({
    ...row,
    crown: crowns[index] || null
  }));

  return leaderboard;
}

module.exports = {
  getNextQuestion,
  submitSwipe,
  getLeaderboard
};
