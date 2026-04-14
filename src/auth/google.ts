/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import axios from 'axios';

export async function getGoogleProfile(code: string) {
  const params = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: process.env.GOOGLE_CALLBACK_URL!,
    grant_type: 'authorization_code',
  });

  const { data: tokens } = await axios.post(
    'https://oauth2.googleapis.com/token',
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  const { data: profile } = await axios.get(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    },
  );

  return {
    id: profile.id,
    displayName: profile.name,
    emails: [{ value: profile.email }],
    photos: [{ value: profile.picture }],
  };
}
