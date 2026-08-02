import Stripe from "https://esm.sh/stripe@14.21.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const PRICE_BASIC     = "price_1TmZK1DWofgqLQp3dHw5Vpja";
const PRICE_TESTAMENT = "price_1TmZK5DWofgqLQp3y8pWLnTU";
const PRICE_WAECHTER  = "price_1U05AkDWofgqLQp3mufsPKrR";

const PRICES = {
  basic:      PRICE_BASIC,
  testament:  PRICE_TESTAMENT,
  waechter:   PRICE_WAECHTER,
};

const PRODUCTS = {
  basic:      "betriebspass_basic",
  testament:  "betriebspass_testament",
  waechter:   "betriebspass_waechter",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const { return_url, user_id, addon } = await req.json();
    if (!return_url || !user_id) {
      return new Response(JSON.stringify({ error: "return_url and user_id required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Bewusst fail-closed: ein unbekanntes Addon darf NIE still auf "basic" zurückfallen,
    // sonst würde ein Nutzer versehentlich den Basic-Preis statt des Addon-Preises zahlen.
    let product: string;
    if (!addon) {
      product = "basic";
    } else if (PRICES[addon]) {
      product = addon;
    } else {
      return new Response(JSON.stringify({ error: `Unbekanntes Addon "${addon}" – noch kein Preis hinterlegt.` }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const priceId = PRICES[product];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "payment",
      success_url: return_url + "?session_id={CHECKOUT_SESSION_ID}&bp_user=" + user_id,
      cancel_url: return_url + "?canceled=true",
      metadata: { user_id, product: PRODUCTS[product] },
      locale: "de",
    });

    return new Response(JSON.stringify({ url: session.url }),
      { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
