-- "Mein stiller Wächter": tägliche Prüfung überfälliger Check-ins per Cron.
--
-- STATUS: bereits angewendet auf das Projekt ysqzdqazcgyuzdorauiq (jobid 1,
-- aktiv, läuft täglich 06:00 UTC). Diese Datei dokumentiert den Live-Stand.
--
-- Der Platzhalter unten ist absichtlich NICHT der echte Wert (der ist nur als
-- Supabase Secret WAECHTER_CRON_SECRET hinterlegt, nicht im Cron-Job-Text
-- sichtbar gehalten werden soll). Bei einer Neueinrichtung:
--   1. Edge Function deployen: supabase functions deploy betriebspass-waechter-check
--   2. Secret setzen: supabase secrets set WAECHTER_CRON_SECRET=<zufälliges-geheimnis>
--      (E-Mail-Versand läuft über die bereits vorhandenen SMTP_*-Secrets, siehe
--      README_WAECHTER.md – kein zusätzlicher E-Mail-Dienst nötig.)
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
