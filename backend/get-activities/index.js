const { Client } = require('pg');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

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

    const coupleResult = await client.query(
      'SELECT couple_id FROM couple_member WHERE user_id = $1',
      [userId]
    );

    if (coupleResult.rows.length === 0) {
      await client.end();
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'User is not part of a couple' }) };
    }

    const coupleId = coupleResult.rows[0].couple_id;

    const result = await client.query(
      'SELECT * FROM activity WHERE couple_id = $1 ORDER BY rank_position ASC NULLS LAST, created_at DESC',
      [coupleId]
    );

    const activitiesWithPhotos = await Promise.all(
      result.rows.map(async (activity) => {
        const photosResult = await client.query(
          'SELECT id, photo_key FROM activity_photo WHERE activity_id = $1 ORDER BY position ASC',
          [activity.id]
        );

        const photos = await Promise.all(
          photosResult.rows.map(async (photo) => {
            const url = await getSignedUrl(
              s3,
              new GetObjectCommand({ Bucket: process.env.PHOTOS_BUCKET, Key: photo.photo_key }),
              { expiresIn: 3600 }
            );
            return { id: photo.id, url };
          })
        );

        return { ...activity, photos };
      })
    );

    await client.end();

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(activitiesWithPhotos),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to fetch activities' }) };
  }
};