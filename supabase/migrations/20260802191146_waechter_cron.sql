-- "Mein stiller Wächter": tägliche Prüfung überfälliger Check-ins per Cron.
--
-- Vor dem Ausführen:
--   1. Edge Function deployen: supabase functions deploy betriebspass-waechter-check
--   2. Secrets setzen:
--        supabase secrets set RESEND_API_KEY=... WAECHTER_FROM_EMAIL="Betriebspass <waechter@betriebspass.de>" WAECHTER_CRON_SECRET=<zufälliges-geheimnis>
--   3. Unten <CRON_SECRET_HIER_EINTRAGEN> durch denselben Wert wie WAECHTER_CRON_SECRET ersetzen.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'betriebspass-waechter-daily-check',
  '0 6 * * *', -- täglich 06:00 UTC
  $$
  select net.http_post(
    url := 'https://ysqzdqazcgyuzdorauiq.supabase.co/functions/v1/betriebspass-waechter-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-CRON-SECRET', '<CRON_SECRET_HIER_EINTRAGEN>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Zum Entfernen des Jobs (z.B. bei Anpassungen):
-- select cron.unschedule('betriebspass-waechter-daily-check');
