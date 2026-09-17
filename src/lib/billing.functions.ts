import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const CheckoutInput = z.object({
  tier: z.enum(["tier1", "tier2"]),
});

const PortalSessionInput = z.object({}).strict();

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth])
  .inputValidator((data) => CheckoutInput.parse(data))
  .handler(async ({ data }) => {
    const { createCheckoutSessionServer } = await import("./stripe.server");
    return createCheckoutSessionServer(data);
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth])
  .inputValidator((data) => PortalSessionInput.parse(data))
  .handler(async ({ data }) => {
    const { createPortalSessionServer } = await import("./stripe.server");
    return createPortalSessionServer(data);
  });
