import {
    SUPABASE_ANON_KEY,
    SUPABASE_URL,
    supabaseClient
} from '../../core/config.js';

export const CREATE_ORDER_FUNCTION_ENDPOINT =
    SUPABASE_URL + '/functions/v1/create-order';

async function getAccessToken() {
    let { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        const { data, error } = await supabaseClient.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
    }

    if (!session?.access_token) {
        throw new Error('Supabase order session unavailable');
    }

    return session.access_token;
}

export async function createRemoteOrder({
    items,
    phone,
    paymentMethod = 'whatsapp'
} = {}) {
    const accessToken = await getAccessToken();

    const response = await fetch(CREATE_ORDER_FUNCTION_ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + accessToken,
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            items,
            phone,
            payment_method: paymentMethod
        })
    });

    const text = await response.text();
    let data = null;

    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = { error: text || 'Invalid order response' };
    }

    if (!response.ok) {
        throw new Error(data?.error || ('Order service error (' + response.status + ')'));
    }

    return data;
}
