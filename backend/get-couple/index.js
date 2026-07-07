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
    const cognitoSub = event.requestContext.authorizer.claims.sub;

    await client.connect();

    const userResult = await client.query(
      'SELECT id FROM "user" WHERE cognito_sub = $1',
      [cognitoSub]
    );

    if (userResult.rows.length === 0) {
      await client.end();
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'User not found' }) };
    }

    const userId = userResult.rows[0].id;

    const result = await client.query(
      `SELECT c.id, c.name, c.invite_code,
              (SELECT COUNT(*) FROM couple_member WHERE couple_id = c.id) as member_count
       FROM couple c
       JOIN couple_member cm ON cm.couple_id = c.id
       WHERE cm.user_id = $1`,
      [userId]
    );

    await client.end();

    if (result.rows.length === 0) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'No couple found' }) };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result.rows[0]),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to fetch couple' }) };
  }
};