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
    const { title, category, notes, dateOccurred, bucket } = body;

    if (!title) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'title is required' }),
      };
    }

    const cognitoSub = event.requestContext.authorizer.claims.sub;

    await client.connect();

    const userResult = await client.query(
      'SELECT id FROM "user" WHERE cognito_sub = $1',
      [cognitoSub]
    );

    if (userResult.rows.length === 0) {
      await client.end();
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User not found. Have they completed couple setup?' }),
      };
    }

    const userId = userResult.rows[0].id;

    const coupleResult = await client.query(
      'SELECT couple_id FROM couple_member WHERE user_id = $1',
      [userId]
    );

    if (coupleResult.rows.length === 0) {
      await client.end();
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User is not part of a couple yet' }),
      };
    }

    const coupleId = coupleResult.rows[0].couple_id;

    const insertResult = await client.query(
      `INSERT INTO activity (couple_id, title, category, notes, created_by, date_occurred, bucket)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, category, notes, created_at, date_occurred, bucket`,
      [coupleId, title, category || null, notes || null, userId, dateOccurred || null, bucket || null]
    );

    await client.end();

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify(insertResult.rows[0]),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to create activity' }),
    };
  }
};