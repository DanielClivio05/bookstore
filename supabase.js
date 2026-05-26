import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://wsrtxsqftjfolgcttkyn.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzcnR4c3FmdGpmb2xnY3R0a3luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NDg3NzUsImV4cCI6MjA5NTMyNDc3NX0.kfz4rWiaRfxHqZRgI6yvU739-p94vgzobfToFybDsnY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
