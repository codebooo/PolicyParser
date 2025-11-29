import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
    apiVersion: "2025-01-27.acacia" as any, // Cast to any to avoid TS error with latest version
});

export async function POST(req: Request) {
    try {
        const { amount } = await req.json();

        if (!process.env.STRIPE_SECRET_KEY) {
            return NextResponse.json(
                { error: "Stripe API key is missing. Please set STRIPE_SECRET_KEY." },
                { status: 500 }
            );
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: "eur",
            automatic_payment_methods: {
                enabled: true,
            },
        });

        return NextResponse.json({ clientSecret: paymentIntent.client_secret });
    } catch (error: any) {
        console.error("Internal Error:", error);
        return NextResponse.json(
            { error: `Internal Server Error: ${error.message}` },
            { status: 500 }
        );
    }
}
