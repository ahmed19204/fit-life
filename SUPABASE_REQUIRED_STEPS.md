# Supabase Required Steps

**Date:** 2026-05-27

---

## 1. Create Supabase Project

1. Go to https://supabase.com/dashboard
2. Create new project
3. Note the **Project URL** and **Anon Key** from Settings → API

## 2. Create Database Tables

Run these SQL statements in the Supabase SQL Editor:

### profiles table
```sql
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
```

### user_profiles table (nutrition data)
```sql
CREATE TABLE IF NOT EXISTS user_profiles (
  id SERIAL PRIMARY KEY,
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  age INTEGER,
  weight NUMERIC,
  height NUMERIC,
  goal TEXT,
  activity_level TEXT,
  diet_type TEXT DEFAULT 'none',
  restrictions JSONB DEFAULT '[]',
  health_conditions JSONB DEFAULT '[]',
  meals_per_day INTEGER DEFAULT 3,
  calories INTEGER,
  protein INTEGER,
  carbs INTEGER,
  fat INTEGER,
  meal_plan JSONB DEFAULT '[]',
  gender TEXT,
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own nutrition profile" ON user_profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upsert own nutrition profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own nutrition profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = user_id);
```

### meals table
```sql
CREATE TABLE IF NOT EXISTS meals (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'Meal',
  time TEXT,
  calories INTEGER DEFAULT 0,
  protein INTEGER DEFAULT 0,
  carbs INTEGER DEFAULT 0,
  fat INTEGER DEFAULT 0,
  image TEXT,
  ai_suggested BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own meals" ON meals
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own meals" ON meals
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own meals" ON meals
  FOR DELETE USING (auth.uid() = user_id);
```

### analysis_history table
```sql
CREATE TABLE IF NOT EXISTS analysis_history (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_id INTEGER REFERENCES meals(id) ON DELETE SET NULL,
  input_type TEXT DEFAULT 'manual',
  prompt TEXT,
  result JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE analysis_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analysis history" ON analysis_history
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own analysis" ON analysis_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

## 3. Enable Google OAuth (Optional)

1. Supabase Dashboard → Authentication → Providers → Google
2. Enable and configure with Google Cloud Console OAuth credentials
3. Set redirect URL to: `https://your-project.supabase.co/auth/v1/callback`
4. In Google Cloud Console, add authorized redirect: your Supabase callback URL

## 4. Edge Function (Optional)

If you want the Supabase Edge Function for AI:

```bash
supabase functions new fitlife-nutrition-ai
# Deploy the function with Google AI key as a secret
supabase secrets set GOOGLE_AI_API_KEY=your-key
supabase functions deploy fitlife-nutrition-ai
```

## 5. Verify Setup

1. Create a test user via the auth page
2. Complete onboarding flow
3. Check that user_profiles and meals tables have data
