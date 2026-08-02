# Mein stiller Wächter – Status

## Live auf dem Projekt (ysqzdqazcgyuzdorauiq)

- **Client** (`app.html`): Einstellungen, Check-in, Vertrauenspersonen – voll nutzbar.
- **Edge Function** `betriebspass-waechter-check`: deployed (v1), getestet per `net.http_post`
  (HTTP 200, `{"geprueft":0,...}` – korrekt, da noch niemand den Wächter aktiviert hat).
  Nutzt die bereits vorhandenen `SMTP_*`-Secrets (dieselben wie `riedel-send-email`) für den
  Mailversand – **kein zusätzlicher E-Mail-Dienst wie Resend nötig**.
- **Cron-Job** `betriebspass-waechter-daily-check`: aktiv, läuft täglich 06:00 UTC
  (`select * from cron.job where jobname = 'betriebspass-waechter-daily-check'`).
- **Checkout-Bug behoben**: `betriebspass-checkout` fiel bei unbekannten Addons (wie
  `waechter`, für das damals noch kein Stripe-Preis existierte) bisher still auf den
  Basic-Preis zurück – ein Nutzer hätte also versehentlich Basic statt Wächter bezahlt.
  Jetzt liefert ein unbekanntes Addon einen klaren 400-Fehler statt einer Fehlbuchung
  (getestet).
- **Stripe-Preis für `waechter` angelegt**: 10,00 € einmalig (identisch zum
  Testament-Preis, per Setup-Funktion aus dessen Werten übernommen).
  `product_id: prod_V05LW8rfusmB2Q`, `price_id: price_1U05AkDWofgqLQp3mufsPKrR`.
  In `betriebspass-checkout/index.ts` hinterlegt und per Live-Checkout-Session-Test
  verifiziert (Session wurde nur erzeugt, nicht abgeschlossen – keine echte Zahlung).
  Die dafür verwendete Einweg-Funktion `betriebspass-setup-waechter-price` ist danach
  stillgelegt (liefert nur noch 410), damit nicht versehentlich weitere Produkte entstehen.

## Noch offen

1. **`WAECHTER_CRON_SECRET` setzen** – aktuell noch NICHT gesetzt (getestet: Aufruf mit
   falschem Secret liefert trotzdem 200, weil die Prüfung bei leerem Secret übersprungen
   wird). Ohne dieses Secret kann die Function von außen mit falschem/fehlendem Header
   aufgerufen werden.
   ```
   supabase secrets set WAECHTER_CRON_SECRET=<Wert>
   ```
   Der bereits im Cron-Job hinterlegte Wert (siehe
   `supabase/migrations/20260802192801_waechter_cron.sql` in der Datenbank, nicht im Klartext
   in diesem Repo) wurde separat mitgeteilt – **muss exakt übereinstimmen**, sonst schlägt
   die Auth-Prüfung fehl.

2. **Echter End-to-End-Test** mit einer Testperson: Wächter aktivieren, `letzterCheckin`
   künstlich weit in die Vergangenheit setzen (z.B. per SQL-Update auf
   `betriebspass_einstellungen`), Cron-Aufruf manuell auslösen, prüfen ob Erinnerungs- bzw.
   Notfall-Mail tatsächlich ankommt.

## Funktionsweise (Kurzfassung)

- Nutzer aktiviert den Wächter in der App, legt Rhythmus + Vertrauenspersonen fest und
  checkt regelmäßig ein (`app.html`, Funktionen `renderWaechter`, `doWaechterCheckin`).
- Der tägliche Cron-Job ruft die Edge Function auf.
- Ist der Check-in bald fällig (innerhalb der Vorlaufzeit), bekommt der Inhaber eine
  Erinnerungs-Mail (E-Mail aus den Einstellungen, sonst Login-E-Mail als Fallback).
- Ist der Check-in überfällig, wird einmalig der Notfallbericht (ohne Safe-Inhalte) per
  E-Mail an alle Vertrauenspersonen verschickt.
- Ein erneuter Check-in setzt `ausgeloestAm`/`erinnerungGesendetAm` zurück.
