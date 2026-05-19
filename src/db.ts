import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function logUserInteraction(userId: number, username: string, ticker: string, result: string) {
    if (!supabaseUrl || !supabaseKey) {
        console.warn('Supabase not configured, skipping log.');
        return;
    }

    try {
        // Upsert user
        await supabase.from('users').upsert({
            id: userId,
            username: username,
            last_active: new Date().toISOString()
        });

        // Insert query history
        await supabase.from('analyses').insert({
            user_id: userId,
            ticker: ticker,
            result: result,
            created_at: new Date().toISOString()
        });
    } catch (e) {
        console.error('Supabase logging error:', e);
    }
}
