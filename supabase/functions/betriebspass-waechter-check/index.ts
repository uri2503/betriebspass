// betriebspass-waechter-check
//
// Wird täglich per Cron aufgerufen (siehe supabase/migrations/*_waechter_cron.sql).
// Prüft für jeden Nutzer mit aktivem "Mein stiller Wächter":
//   - Ist der Check-in bald fällig (innerhalb der Vorlaufzeit)? -> Erinnerung an den
//     Betriebsinhaber senden.
//   - Ist der Check-in überfällig? -> Notfallbericht (ohne Safe-Inhalte) einmalig an
//     alle hinterlegten Vertrauenspersonen senden.
//
// Benötigte Secrets (per `supabase secrets set ...` zu setzen):
//   RESEND_API_KEY        – API-Key von resend.com
//   WAECHTER_FROM_EMAIL    – Absenderadresse, z.B. "Betriebspass <waechter@betriebspass.de>"
//   WAECHTER_CRON_SECRET    – frei gewähltes Geheimnis, muss mit dem Wert in der
//                             Cron-Migration übereinstimmen (Schutz gegen fremde Aufrufe)
//
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY sind für Edge Functions automatisch
// verfügbar und müssen nicht separat gesetzt werden.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("WAECHTER_FROM_EMAIL") || "Betriebspass <waechter@betriebspass.de>";
const CRON_SECRET = Deno.env.get("WAECHTER_CRON_SECRET") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const MODUL_LABELS: Record<string, string> = {
  auftraege: "🔧 Laufende Aufträge", kunden: "🏠 Kundenliste", lieferanten: "🚚 Lieferanten",
  inventar: "⚙️ Inventar / Maschinen", fuhrpark: "🚗 Fuhrpark / Fahrzeuge",
  immobilien: "🏘️ Immobilien / Liegenschaften", finanzen: "🏦 Bank & Finanzen",
  vertraege: "📄 Verträge", versicherungen: "🛡️ Versicherungen", rechtliches: "⚖️ Rechtliches",
  behoerden: "🏛️ Behörden & Steuern", zugaenge: "🔐 Zugänge & Passwörter",
  kontakte: "👤 Wichtige Kontakte", wissen: "💡 Betriebswissen", notizen: "📝 Notizen"
};
const MODUL_ORDER = Object.keys(MODUL_LABELS);

// Feldbezeichnungen werden hier bewusst nicht 1:1 aus app.html dupliziert (Drift-Risiko).
// Stattdessen werden die technischen Feldschlüssel automatisch lesbar formatiert.
function humanizeKey(k: string): string {
  return k
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY fehlt – E-Mail wurde NICHT gesendet:", subject, to);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html })
  });
  if (!res.ok) {
    console.error("Resend-Fehler", res.status, await res.text());
  }
}

async function buildNotfallHtml(userId: string, settingsData: any): Promise<string> {
  const { data: entries } = await supabase
    .from("betriebspass_eintraege")
    .select("*")
    .eq("user_id", userId);

  const grouped: Record<string, any[]> = {};
  for (const m of MODUL_ORDER) grouped[m] = [];
  for (const e of entries || []) {
    if (grouped[e.modul]) grouped[e.modul].push(e);
  }

  const firma = settingsData?.firma || "Betrieb";
  let html = `<h1 style="color:#1a3a5c">🗂️ Betriebspass – ${escapeHtml(firma)}</h1>`;
  html += `<p style="color:#c0392b;font-weight:bold">⚠️ Automatisch versendet, weil der Check-in von "Mein stiller Wächter" überfällig ist. Dieses Dokument enthält vertrauliche Betriebsinformationen – bitte sicher behandeln.</p>`;

  if (settingsData?.anweisung) {
    html += `<div style="background:#f0f6fc;border:1px solid #2a6090;border-radius:4px;padding:12px 16px;margin:16px 0"><strong>📋 Persönliche Anweisung des Inhabers:</strong><br>${escapeHtml(settingsData.anweisung)}</div>`;
  }
  if (settingsData?.safehinweis) {
    html += `<div style="background:#fdecea;border:1px solid #c0392b;border-radius:4px;padding:12px 16px;margin:16px 0"><strong>🔒 Hinweis zum Safe-PIN:</strong><br>${escapeHtml(settingsData.safehinweis)}</div>`;
  }

  const testament = settingsData?._testament || {};
  const testamentFields = Object.keys(testament).filter((k) => testament[k]);
  if (testamentFields.length > 0) {
    html += `<h2 style="color:#1a3a5c;border-bottom:2px solid #1a3a5c">📜 Digitales Testament</h2>`;
    for (const k of testamentFields) {
      html += `<p><strong>${escapeHtml(humanizeKey(k))}:</strong><br>${escapeHtml(testament[k])}</p>`;
    }
  }

  for (const m of MODUL_ORDER) {
    const list = grouped[m];
    html += `<h2 style="color:#1a3a5c;border-bottom:2px solid #1a3a5c">${MODUL_LABELS[m]} (${list.length})</h2>`;
    if (list.length === 0) { html += `<p style="color:#999;font-style:italic">Keine Einträge.</p>`; continue; }
    for (const entry of list) {
      const d = entry.data || {};
      const keys = Object.keys(d).filter((k) => k !== "dokumente" && d[k]);
      html += `<div style="border:1px solid #e0e0e0;border-left:3px solid #2a6090;padding:10px 14px;margin-bottom:8px">`;
      for (const k of keys) {
        html += `<div style="font-size:12px"><span style="color:#888">${escapeHtml(humanizeKey(k))}:</span> ${escapeHtml(String(d[k]))}</div>`;
      }
      html += `</div>`;
    }
  }

  html += `<p style="color:#999;font-size:11px;margin-top:24px">🔒 Der Safe ist PIN-geschützt – seine Inhalte sind aus Sicherheitsgründen nicht in diesem Bericht enthalten. Erstellt am ${new Date().toLocaleString("de-DE")} · Betriebspass</p>`;
  return html;
}

async function handleCheck() {
  const results = { geprueft: 0, erinnerungen: 0, ausloesungen: 0, fehler: [] as string[] };

  const { data: rows, error } = await supabase
    .from("betriebspass_einstellungen")
    .select("user_id, data");
  if (error) { results.fehler.push(error.message); return results; }

  for (const row of rows || []) {
    const w = row.data?._waechter;
    if (!w || !w.aktiv || !w.letzterCheckin) continue;
    results.geprueft++;

    const intervallTage = w.intervallTage || 90;
    const vorlaufTage = w.vorlaufTage || 7;
    const lastCheckin = new Date(w.letzterCheckin).getTime();
    const daysSince = (Date.now() - lastCheckin) / 86400000;

    try {
      if (daysSince >= intervallTage) {
        if (w.ausgeloestAm) continue; // bereits ausgelöst, kein erneuter Versand
        const personen = (w.vertrauenspersonen || []).filter((p: any) => p.email);
        if (personen.length === 0) continue;
        const html = await buildNotfallHtml(row.user_id, row.data);
        for (const p of personen) {
          await sendEmail(p.email, `Betriebspass – Notfallbericht (${row.data?.firma || "Betrieb"})`, html);
        }
        row.data._waechter.ausgeloestAm = new Date().toISOString();
        await supabase.from("betriebspass_einstellungen")
          .update({ data: row.data, updated_at: new Date().toISOString() })
          .eq("user_id", row.user_id);
        results.ausloesungen++;
      } else if (intervallTage - daysSince <= vorlaufTage) {
        const alreadySentRecently = w.erinnerungGesendetAm &&
          (Date.now() - new Date(w.erinnerungGesendetAm).getTime()) < vorlaufTage * 86400000;
        if (alreadySentRecently) continue;
        const ownerEmail = row.data?.email;
        if (!ownerEmail) continue;
        const naechster = new Date(lastCheckin + intervallTage * 86400000).toLocaleDateString("de-DE");
        const html = `<p>Dein Check-in für "Mein stiller Wächter" im Betriebspass ist bald fällig (${naechster}).</p>
          <p>Melde dich im Betriebspass an und klicke unter "Mein stiller Wächter" auf "Jetzt einchecken", sonst erhalten deine Vertrauenspersonen automatisch deinen Notfallbericht.</p>`;
        await sendEmail(ownerEmail, "Betriebspass – Check-in bald fällig", html);
        row.data._waechter.erinnerungGesendetAm = new Date().toISOString();
        await supabase.from("betriebspass_einstellungen")
          .update({ data: row.data, updated_at: new Date().toISOString() })
          .eq("user_id", row.user_id);
        results.erinnerungen++;
      }
    } catch (e) {
      results.fehler.push(`${row.user_id}: ${e}`);
    }
  }

  return results;
}

serve(async (req) => {
  if (CRON_SECRET) {
    const provided = req.headers.get("X-CRON-SECRET") || "";
    if (provided !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }
  }
  const results = await handleCheck();
  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
});
