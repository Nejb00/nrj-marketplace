import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://peojyqliwrtghomyukwn.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_Fy-Q_BAginf2p6UdUtxDMA_V1hP8Slt';
export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const BASE_URL = 'https://nejb00.github.io/nrj-marketplace/';
export const WHATSAPP_NUMBER = '242066271882';
export const PRODUCTS_PER_PAGE = 20;
export const NEW_PRODUCT_DAYS = 7;
export const POPULAR_THRESHOLD = 20;
export const MAX_SEARCH_RESULTS = 7;
export const SEARCH_HISTORY_KEY = 'nrj_search_history';
export const MAX_HISTORY_ITEMS = 5;
export const MAX_PLACEHOLDER_SUGGESTIONS = 10;
