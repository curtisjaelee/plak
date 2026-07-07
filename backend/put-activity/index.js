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
    const activityId = event.pathParameters.id;
    const body = JSON.parse(event.body);
    const notes = body.notes;
    const timesDone = body.timesDone;
    const dateOccurred = body.dateOccurred;
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

    const result = await client.query(
        `UPDATE activity
        SET notes = COALESCE($1, notes),
            times_done = COALESCE($2, times_done),
            date_occurred = COALESCE($3, date_occurred)
        WHERE id = $4 AND couple_id = $5
        RETURNING id, title, category, notes, created_at, times_done, date_occurred`,
        [notes, timesDone, dateOccurred, activityId, coupleId]
        );

    await client.end();

    if (result.rows.length === 0) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Activity not found' }) };
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(result.rows[0]) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to update activity' }) };
  }
};