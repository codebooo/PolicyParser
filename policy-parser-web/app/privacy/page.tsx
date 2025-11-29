import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function PrivacyPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-4xl font-bold text-foreground mb-8">Privacy Policy</h1>

      <Card className="border-primary/20 bg-background/40 backdrop-blur-md">
        <CardContent className="space-y-6 text-muted-foreground leading-relaxed pt-6">
          <p>Last Updated: {new Date().toLocaleDateString()}</p>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">1. Our Commitment to Privacy</h2>
            <p>
              At PolicyParser, we take your privacy extremely seriously. We believe that you shouldn't have to sacrifice your privacy to understand your privacy rights.
              This tool is designed to be ephemeral and stateless.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">2. Data Collection</h2>
            <p className="font-bold text-primary">We do not collect, store, or share your personal data.</p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li><strong>No Document Storage:</strong> When you upload a document for analysis, it is processed in memory and immediately discarded. We do not save your files to any database or server storage.</li>
              <li><strong>No Personal Identifiers:</strong> We do not require you to create an account, provide an email address, or give us your name to use the service.</li>
              <li><strong>No Tracking Cookies:</strong> We do not use cookies to track your behavior across the web. We only use essential local storage to maintain your current session state (like the analysis progress), which is cleared when you close the tab.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">3. Third-Party Services</h2>
            <p>
              We use a secure AI processing engine to analyze the text you provide. The text is sent securely to the API for the sole purpose of analysis and is not used to train their models.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">4. Changes to This Policy</h2>
            <p>
              We may update this policy from time to time. Since we do not collect your email, we advise you to review this page periodically for any changes.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  )
}
