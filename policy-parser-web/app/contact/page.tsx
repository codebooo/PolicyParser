import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

export default function ContactPage() {
    return (
        <div className="container mx-auto px-4 py-20 max-w-2xl">
            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle>Contact Us</CardTitle>
                    <CardDescription>Have questions or feedback? We'd love to hear from you.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Name</Label>
                            <Input id="name" placeholder="Your name" className="bg-white/5 border-white/10" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" placeholder="your@email.com" className="bg-white/5 border-white/10" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="message">Message</Label>
                            <Textarea id="message" placeholder="How can we help?" className="bg-white/5 border-white/10 min-h-[150px]" />
                        </div>
                        <Button type="submit" className="w-full">Send Message</Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
