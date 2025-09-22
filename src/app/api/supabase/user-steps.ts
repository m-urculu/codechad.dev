import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL!,
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_ANON_KEY!
);

export async function registerUserStepFulfillment(user_id: string) {
  // Insert a new row for the user if not exists
  const { data, error } = await supabase
    .from('user_step_fulfillment')
    .upsert([{ user_id }], { onConflict: 'user_id' });
  if (error) {
    console.error('[user_step_fulfillment] Registration failed:', error.message);
    throw new Error('Failed to register user in user_step_fulfillment: ' + error.message);
  } else {
    // console.log('[user_step_fulfillment] Registration success:', data);
  }
  return data;
}
