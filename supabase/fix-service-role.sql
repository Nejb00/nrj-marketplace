-- ⚡ CORRECTIF — Droits service_role pour l'Assistant NRJ (fonction Edge chat-ai)
-- Pourquoi : le SQL de la phase 2 accordait les droits aux rôles du site
-- (anon / authenticated) mais pas au rôle SERVICE qu'utilise la fonction
-- Edge pour lire les réglages et écrire les réponses du bot.
--
-- Où : Dashboard Supabase → SQL Editor → New query → coller TOUT ce fichier → Run
-- (Sans risque : peut être relancé, n'efface rien, ne modifie aucune donnée.)

grant select on public.chat_settings to service_role;

grant select, insert on public.chat_messages to service_role;

grant select, update on public.chat_sessions to service_role;

-- ✅ Vérification : les 4 lignes doivent afficher true
select 'chat_settings SELECT' as test, has_table_privilege('service_role', 'public.chat_settings', 'SELECT') as ok
union all
select 'chat_messages SELECT', has_table_privilege('service_role', 'public.chat_messages', 'SELECT')
union all
select 'chat_messages INSERT', has_table_privilege('service_role', 'public.chat_messages', 'INSERT')
union all
select 'chat_sessions UPDATE', has_table_privilege('service_role', 'public.chat_sessions', 'UPDATE');
