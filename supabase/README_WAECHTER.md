# Mein stiller Wächter – Deployment

Die Client-Seite (Einstellungen, Check-in, Vertrauenspersonen) ist in `app.html` bereits live.
Der automatische Versand bei überfälligem Check-in braucht noch folgende Schritte:

1. **Edge Function deployen**
   ```
   supabase functions deploy betriebspass-waechter-check --no-verify-jwt
   ```
   `--no-verify-jwt`, weil der Cron-Job die Funktion ohne Nutzer-Login aufruft. Der Schutz
   gegen fremde Aufrufe läuft stattdessen über `WAECHTER_CRON_SECRET` (Header `X-CRON-SECRET`).

2. **Secrets setzen**
   ```
   supabase secrets set \
     RESEND_API_KEY=<Resend-API-Key> \
     WAECHTER_FROM_EMAIL="Betriebspass <waechter@betriebspass.de>" \
     WAECHTER_CRON_SECRET=<selbst gewähltes, zufälliges Geheimnis>
   ```
   Die Absenderadresse muss bei Resend als verifizierte Domain hinterlegt sein.

3. **Migration ausführen**
   In `supabase/migrations/20260802191146_waechter_cron.sql` den Platzhalter
   `<CRON_SECRET_HIER_EINTRAGEN>` durch denselben Wert wie `WAECHTER_CRON_SECRET` ersetzen,
   dann die Migration anwenden (`supabase db push` oder über den SQL-Editor im Dashboard).

4. **Preis im Checkout hinterlegen**
   Der Kauf-Button ruft `doAddonCheckout('waechter')` auf, dieselbe Funktion wie beim
   Testament. Die Edge Function `betriebspass-checkout` (nicht in diesem Repo) muss dafür
   einen Preis für `addon === 'waechter'` kennen – das ist außerhalb dieses Repos zu prüfen.

5. **Testen**
   Die Function manuell aufrufen (mit korrektem `X-CRON-SECRET`-Header) und prüfen, ob
   Erinnerungen bzw. Notfallberichte wie erwartet verschickt werden. Am besten zunächst mit
   einem Testaccount, dessen `letzterCheckin` künstlich weit in die Vergangenheit gesetzt wird.

## Funktionsweise (Kurzfassung)

- Nutzer aktiviert den Wächter in der App, legt Rhythmus + Vertrauenspersonen fest und
  checkt regelmäßig ein (`app.html`, Funktionen `renderWaechter`, `doWaechterCheckin`).
- Ein täglicher Cron-Job (`supabase/migrations/*_waechter_cron.sql`) ruft die Edge Function auf.
- Ist der Check-in bald fällig (innerhalb der Vorlaufzeit), bekommt der Inhaber eine
  Erinnerungs-Mail.
- Ist der Check-in überfällig, wird einmalig der Notfallbericht (ohne Safe-Inhalte) per
  E-Mail an alle Vertrauenspersonen verschickt.
- Ein erneuter Check-in setzt `ausgeloestAm`/`erinnerungGesendetAm` zurück.
