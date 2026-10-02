// From your Supabase project: Project Settings -> API.
// The anon key is meant to be public/embedded in client code — it is not a secret.
// Access control comes from Row Level Security policies (see supabase/schema.sql),
// not from hiding this key.
export const SUPABASE_URL = 'https://your-project.supabase.co';
export const SUPABASE_ANON_KEY = 'your-anon-key';
