const { Client } = require('pg');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({ region: process.env.AWS_REGION });

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

    const coupleResult = await client.query(
      'SELECT couple_id FROM couple_member WHERE user_id = $1',
      [userResult.rows[0].id]
    );

    if (coupleResult.rows.length === 0) {
      await client.end();
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'No couple found' }) };
    }

    const coupleId = coupleResult.rows[0].couple_id;

    // Confirm this activity actually belongs to the user's couple before doing anything
    const checkResult = await client.query(
      'SELECT id FROM activity WHERE id = $1 AND couple_id = $2',
      [activityId, coupleId]
    );

    if (checkResult.rows.length === 0) {
      await client.end();
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Activity not found' }) };
    }

    // Grab the photo keys before deleting the rows, so we can clean up S3 after
    const photosResult = await client.query(
      'SELECT photo_key FROM activity_photo WHERE activity_id = $1',
      [activityId]
    );

    await client.query('DELETE FROM activity_photo WHERE activity_id = $1', [activityId]);

    const result = await client.query(
      'DELETE FROM activity WHERE id = $1 AND couple_id = $2 RETURNING id',
      [activityId, coupleId]
    );

    await client.end();

    // Best-effort S3 cleanup — don't fail the whole request if this part has issues
    for (const photo of photosResult.rows) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: process.env.PHOTOS_BUCKET, Key: photo.photo_key }));
      } catch (s3Err) {
        console.error('Failed to delete S3 object:', s3Err);
      }
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ deleted: result.rows[0].id }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to delete activity' }) };
  }
};