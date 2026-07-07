const { Client } = require('pg');
const crypto = require('crypto');

function generateInviteCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

exports.handler = async (event) => {
  const client = new Client({
    host: process.env.DB_HOST,
    port: 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const attrs = event.request.userAttributes;
    const sub = attrs.sub;
    const email = attrs.email;
    const name = attrs.name || email;
    const inviteCode = attrs['custom:invite_code'];

    await client.connect();

    let coupleId;

    if (inviteCode) {
      const coupleResult = await client.query(
        'SELECT id FROM couple WHERE invite_code = $1',
        [inviteCode.toUpperCase()]
      );

      if (coupleResult.rows.length > 0) {
        coupleId = coupleResult.rows[0].id;
      }
    }

    if (!coupleId) {
      const newCode = generateInviteCode();
      const coupleResult = await client.query(
        'INSERT INTO couple (name, invite_code) VALUES ($1, $2) RETURNING id',
        [`${name}'s household`, newCode]
      );
      coupleId = coupleResult.rows[0].id;
    }

    const userResult = await client.query(
      `INSERT INTO "user" (email, name, cognito_sub)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [email, name, sub]
    );
    const userId = userResult.rows[0].id;

    const role = inviteCode && coupleId ? 'member' : 'owner';

    await client.query(
      'INSERT INTO couple_member (couple_id, user_id, role) VALUES ($1, $2, $3)',
      [coupleId, userId, role]
    );

    await client.end();
  } catch (err) {
    console.error('Post-confirmation error:', err);
  }

  return event;
};