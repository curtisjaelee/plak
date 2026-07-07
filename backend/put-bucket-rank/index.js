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
    const activityId = body.activityId;
    const bucket = body.bucket;
    const position = body.position; // 1-based: where this activity should land
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

    // Confirm the activity belongs to this couple before touching anything
    const activityCheck = await client.query(
      'SELECT id FROM activity WHERE id = $1 AND couple_id = $2',
      [activityId, coupleId]
    );
    if (activityCheck.rows.length === 0) {
      await client.end();
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Activity not found' }) };
    }

    await client.query('BEGIN');

    // Shift everything in this bucket at or after the target position down by one
    await client.query(
      `UPDATE activity
       SET rank_position = rank_position + 1
       WHERE couple_id = $1 AND bucket = $2 AND rank_position >= $3 AND id != $4`,
      [coupleId, bucket, position, activityId]
    );

    // Place the new activity at the target position
    await client.query(
      'UPDATE activity SET bucket = $1, rank_position = $2 WHERE id = $3 AND couple_id = $4',
      [bucket, position, activityId, coupleId]
    );

    await client.query('COMMIT');
    await client.end();

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    console.error(err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to set rank' }) };
  }
};