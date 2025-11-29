"use client";

import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, Bitcoin, X } from "lucide-react";
import { upgradeToPro } from "@/app/paymentActions";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "pk_test_placeholder");

function CheckoutForm({ onSuccess }: { onSuccess: () => void }) {
    const stripe = useStripe();
    const elements = useElements();
    const [message, setMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) return;

        setIsLoading(true);

        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: window.location.origin + "/account",
            },
            redirect: "if_required",
        });

        if (error) {
            setMessage(error.message || "An unexpected error occurred.");
            setIsLoading(false);
        } else if (paymentIntent && paymentIntent.status === "succeeded") {
            setMessage("Payment successful!");
            await onSuccess();
        } else {
            setMessage("Payment processing...");
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <PaymentElement />
            {message && <div className="text-red-500 text-sm">{message}</div>}
            <Button disabled={isLoading || !stripe || !elements} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Pay €0.99"}
            </Button>
        </form>
    );
}

export function PaymentModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const [clientSecret, setClientSecret] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("card");
    const [isProcessing, setIsProcessing] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (isOpen) {
            // Create PaymentIntent
            fetch("/api/create-payment-intent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount: 99 }), // €0.99
            })
                .then((res) => res.json())
                .then((data) => setClientSecret(data.clientSecret))
                .catch((err) => console.error("Failed to init payment", err));
        }
    }, [isOpen]);

    const handleSuccess = async () => {
        setIsProcessing(true);
        const result = await upgradeToPro();
        if (result.success) {
            alert("Successfully upgraded to Pro! Welcome aboard.");
            router.push("/account");
            onClose();
        } else {
            alert("Payment successful, but upgrade failed. Please contact support.");
        }
        setIsProcessing(false);
    };

    const handleCryptoPayment = async () => {
        setIsProcessing(true);
        // Simulate crypto verification
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await handleSuccess();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-lg p-6 bg-[#0f172a] border border-white/10 rounded-xl shadow-2xl animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-white">Upgrade to Pro</h2>
                        <p className="text-sm text-muted-foreground">Complete your payment to unlock all features.</p>
                    </div>
                    <button onClick={onClose} className="text-muted-foreground hover:text-white transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="grid grid-cols-4 gap-2 p-1 bg-black/40 rounded-lg mb-6 border border-white/5">
                    {['card', 'paypal', 'klarna', 'crypto'].map((method) => (
                        <button
                            key={method}
                            onClick={() => setPaymentMethod(method)}
                            className={clsx(
                                "flex items-center justify-center py-2 text-xs font-medium rounded-md transition-all capitalize",
                                paymentMethod === method
                                    ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                                    : "text-muted-foreground hover:text-white hover:bg-white/5"
                            )}
                        >
                            {method}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="min-h-[300px]">
                    {['card', 'paypal', 'klarna'].includes(paymentMethod) ? (
                        clientSecret ? (
                            <Elements stripe={stripePromise} options={{
                                clientSecret,
                                appearance: { theme: 'night', variables: { colorPrimary: '#06b6d4' } },
                            }}>
                                <CheckoutForm onSuccess={handleSuccess} />
                            </Elements>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-64 space-y-4">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">Initializing secure payment...</p>
                            </div>
                        )
                    ) : (
                        <div className="space-y-6 text-center py-4 animate-in fade-in slide-in-from-right-4">
                            <div className="p-6 bg-white/5 rounded-xl border border-white/10">
                                <p className="text-sm text-muted-foreground mb-3">Send 0.99€ equivalent to:</p>
                                <code className="block p-3 bg-black/50 rounded-lg text-xs break-all font-mono text-primary border border-primary/20 select-all cursor-pointer hover:bg-black/70 transition-colors">
                                    0x71C7656EC7ab88b098defB751B7401B5f6d8976F
                                </code>
                                <div className="flex justify-center gap-4 mt-4 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div> ETH</span>
                                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div> USDC</span>
                                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-500"></div> USDT</span>
                                </div>
                            </div>
                            <Button onClick={handleCryptoPayment} disabled={isProcessing} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-lg">
                                {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "I have sent the funds"}
                            </Button>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
