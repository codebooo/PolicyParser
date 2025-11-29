import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
    apiVersion: "2025-01-27.acacia" as any, // Cast to any to avoid TS error with latest version
});

export async function POST(req: Request) {
    try {
        const { amount, paymentMethod } = await req.json();

        if (!process.env.STRIPE_SECRET_KEY) {
            return NextResponse.json(
                { error: "Stripe API key is missing. Please set STRIPE_SECRET_KEY." },
                { status: 500 }
            );
        }

        // Configure payment method types based on the selected method
        let paymentMethodTypes: Stripe.PaymentIntentCreateParams.PaymentMethodType[] = ['card'];
        
        if (paymentMethod === 'paypal') {
            paymentMethodTypes = ['paypal'];
        } else if (paymentMethod === 'klarna') {
            paymentMethodTypes = ['klarna'];
        } else {
            // Default: card with automatic payment methods enabled
            paymentMethodTypes = ['card'];
        }

        const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
            amount: amount,
            currency: "eur",
            payment_method_types: paymentMethodTypes,
        };

        // Klarna requires additional shipping/billing info for some regions
        if (paymentMethod === 'klarna') {
            paymentIntentParams.payment_method_options = {
                klarna: {
                    preferred_locale: 'en-US',
                }
            };
        }

        const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

        return NextResponse.json({ clientSecret: paymentIntent.client_secret });
    } catch (error: any) {
        console.error("Internal Error:", error);
        return NextResponse.json(
            { error: `Internal Server Error: ${error.message}` },
            { status: 500 }
        );
    }
}
