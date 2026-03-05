import { createServerClient } from '@supabase/ssr';
import { createClient, type User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const extractBearerToken = (request: Request) => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;

  const [scheme, ...rest] = authHeader.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer') return null;

  const token = rest.join(' ').trim();
  return token || null;
};

export const getAuthenticatedUser = async (request: Request): Promise<User | null> => {
  const bearerToken = extractBearerToken(request);
  if (bearerToken) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${bearerToken}`,
          },
        },
      }
    );

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(bearerToken);

    if (!error && user) {
      return user;
    }

    return null;
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!error && user) {
    return user;
  }

  return null;
};

export const requireAuth = async (request: Request) => {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  return {
    user,
    response: null,
  };
};
