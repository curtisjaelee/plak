const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Client } = require('pg');
const crypto = require('crypto');

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
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User not found' }),
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
        body: JSON.stringify({ error: 'User is not part of a couple' }),
      };
    }

    const coupleId = coupleResult.rows[0].couple_id;

    const activityResult = await client.query(
      'SELECT id FROM activity WHERE id = $1 AND couple_id = $2',
      [activityId, coupleId]
    );

    if (activityResult.rows.length === 0) {
      await client.end();
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Activity not found' }),
      };
    }

    const contentType = (event.queryStringParameters && event.queryStringParameters.contentType) || 'image/jpeg';
    const extension = contentType.split('/')[1] || 'jpg';
    const photoKey = `couples/${coupleId}/activities/${activityId}/${crypto.randomUUID()}.${extension}`;

    const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
        Bucket: process.env.PHOTOS_BUCKET,
        Key: photoKey,
        ContentType: contentType,
    }),
    { expiresIn: 300 }
    );

    const positionResult = await client.query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM activity_photo WHERE activity_id = $1',
    [activityId]
    );
    const nextPosition = positionResult.rows[0].next_position;

    await client.query(
    'INSERT INTO activity_photo (activity_id, photo_key, position) VALUES ($1, $2, $3)',
    [activityId, photoKey, nextPosition]
    );

    await client.end();

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ uploadUrl, photoKey }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to generate upload URL' }),
    };
  }
};