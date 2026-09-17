import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";

import { getServiceRoleClient, getStripeClient, getTierFromPriceId } from "@/lib/stripe.server";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
          return new Response("Server misconfigured", { status: 500 });
        }

        const signature = request.headers.get("stripe-signature");
        if (!signature) {
          return new Response("Missing Stripe signature", { status: 400 });
        }

        const body = await request.text();
        let event: Stripe.Event;

        try {
          event = getStripeClient().webhooks.constructEvent(body, signature, webhookSecret);
        } catch {
          return new Response("Invalid Stripe signature", { status: 400 });
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object as Stripe.Checkout.Session;
              const userId = session.metadata?.user_id;
              const stripeCustomerId =
                typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
              const stripeSubscriptionId =
                typeof session.subscription === "string"
                  ? session.subscription
                  : session.subscription?.id ?? null;
              const tier = session.metadata?.tier ?? getTierFromPriceId(session.line_items?.data?.[0]?.price?.id ?? null) ?? "free";

              if (userId && stripeCustomerId && stripeSubscriptionId) {
                await getServiceRoleClient().rpc("set_user_tier", {
                  p_user_id: userId,
                  p_tier: tier,
                  p_stripe_customer_id: stripeCustomerId,
                  p_stripe_subscription_id: stripeSubscriptionId,
                });
              }
              break;
            }

            case "customer.subscription.updated": {
              const subscription = event.data.object as Stripe.Subscription;
              const stripeCustomerId =
                typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null;
              const stripeSubscriptionId = subscription.id;
              if (!stripeCustomerId) break;

              const priceId = subscription.items.data[0]?.price.id ?? null;
              const tier = getTierFromPriceId(priceId) ?? "free";

              const active = subscription.status === "active" || subscription.status === "trialing";
              const { data: profile } = await getServiceRoleClient()
                .from("profiles")
                .select("id")
                .eq("stripe_customer_id", stripeCustomerId)
                .maybeSingle();

              if (profile?.id) {
                await getServiceRoleClient().rpc("set_user_tier", {
                  p_user_id: profile.id,
                  p_tier: active ? tier : "free",
                  p_stripe_customer_id: stripeCustomerId,
                  p_stripe_subscription_id: active ? stripeSubscriptionId : null,
                });
              }
              break;
            }

            case "customer.subscription.deleted": {
              const subscription = event.data.object as Stripe.Subscription;
              const stripeCustomerId =
                typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null;
              if (!stripeCustomerId) break;

              const { data: profile } = await getServiceRoleClient()
                .from("profiles")
                .select("id")
                .eq("stripe_customer_id", stripeCustomerId)
                .maybeSingle();

              if (profile?.id) {
                await getServiceRoleClient().rpc("set_user_tier", {
                  p_user_id: profile.id,
                  p_tier: "free",
                  p_stripe_customer_id: stripeCustomerId,
                  p_stripe_subscription_id: null,
                });
              }
              break;
            }
            default:
              break;
          }
        } catch (error) {
          console.error("[stripe-webhook] failed to process event", error);
          return new Response("Webhook processing failed", { status: 500 });
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
