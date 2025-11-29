import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Heart, Coffee } from "lucide-react"
import Link from "next/link"

export default function SupportPage() {
    return (
        <div className="container mx-auto px-4 py-20 max-w-2xl text-center">
            <div className="mb-12">
                <div className="h-20 w-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                    <Heart className="h-10 w-10 text-red-500 fill-red-500" />
                </div>
                <h1 className="text-4xl font-bold mb-4">Support PolicyParser</h1>
                <p className="text-muted-foreground text-lg">
                    PolicyParser is an independent project dedicated to making the internet safer and more transparent.
                    Your support helps keep the servers running and the AI analyzing.
                </p>
            </div>

            <Card className="bg-white/5 border-white/10 backdrop-blur-sm hover:border-primary/30 transition-all">
                <CardHeader>
                    <CardTitle className="flex items-center justify-center gap-2">
                        <Coffee className="h-6 w-6 text-amber-400" />
                        Buy me a coffee
                    </CardTitle>
                    <CardDescription>Support the developer directly via Ko-fi.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="mb-6 text-sm text-muted-foreground">
                        Every donation goes directly towards server costs, API fees, and future development.
                        Plus, you get my eternal gratitude!
                    </p>
                    <Link href="https://ko-fi.com/codebo" target="_blank">
                        <Button size="lg" className="bg-[#FF5E5B] hover:bg-[#FF5E5B]/90 text-white font-bold rounded-full px-8">
                            Support on Ko-fi
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        </div>
    )
}
