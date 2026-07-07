const { Client } = require('pg');

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Content-Type': 'application/json',
  };

  const client = new Client({
    host: process.env.DB_HOST,
    port: 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const body = JSON.parse(event.body);
    const orderedIds = body.orderedIds;
    const cognitoSub = event.requestContext.authorizer.claims.sub;

    await client.connect();

    const userResult = await client.query('SELECT id FROM "user" WHERE cognito_sub = $1', [cognitoSub]);
    if (userResult.rows.length === 0) {
      await client.end();
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'User not found' }) };
    }

    const coupleResult = await client.query(
      'SELECT couple_id FROM couple_member WHERE user_id = $1',
      [userResult.rows[0].id]
    );
    if (coupleResult.rows.length === 0) {
      await client.end();
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'No couple found' }) };
    }

    const coupleId = coupleResult.rows[0].couple_id;

    await client.query('BEGIN');

    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        'UPDATE activity SET rank_position = $1 WHERE id = $2 AND couple_id = $3',
        [i + 1, orderedIds[i], coupleId]
      );
    }

    await client.query('COMMIT');
    await client.end();

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    console.error(err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to reorder' }) };
  }
};