import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-privacy',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="min-h-screen bg-background py-10 px-4">
      <div class="max-w-3xl mx-auto bg-card rounded-2xl shadow-sm p-8">
        <a routerLink="/" class="text-sm text-primary hover:underline mb-6 inline-block">&larr; Back to Spenza</a>

        <h1 class="text-3xl font-bold text-foreground mb-2">Privacy Policy</h1>
        <p class="text-sm text-muted-foreground mb-8">Last updated: June 1, 2026</p>

        <section class="mb-6">
          <h2 class="text-lg font-semibold text-foreground mb-2">1. Overview</h2>
          <p class="text-muted-foreground leading-relaxed">
            Spenza ("we", "our", or "us") is a personal finance tracking app. We are committed to
            protecting your privacy. This policy explains what data we collect, why we collect it,
            and how we keep it safe.
          </p>
        </section>

        <section class="mb-6">
          <h2 class="text-lg font-semibold text-foreground mb-2">2. Data We Collect</h2>
          <ul class="list-disc list-inside text-muted-foreground leading-relaxed space-y-1">
            <li><strong>Google Account:</strong> Your email address and name when you sign in with Google, used solely to identify your account.</li>
            <li><strong>Expense Data:</strong> Expenses and financial records you enter are stored in your own Google Drive or our secure cloud, depending on your chosen backup mode.</li>
            <li><strong>Device Token:</strong> A push-notification token so we can send you expense reminders (only with your permission).</li>
            <li><strong>Subscription Status:</strong> Your plan tier and renewal date, stored in our database to provide Pro features.</li>
          </ul>
        </section>

        <section class="mb-6">
          <h2 class="text-lg font-semibold text-foreground mb-2">3. How We Use Your Data</h2>
          <ul class="list-disc list-inside text-gray-600 leading-relaxed space-y-1">
            <li>To provide and improve the Spenza service.</li>
            <li>To authenticate you securely via Google Sign-In.</li>
            <li>To send optional expense reminders (you can disable these in Settings).</li>
            <li>To manage your subscription and grant access to Pro features.</li>
          </ul>
        </section>

        <section class="mb-6">
          <h2 class="text-lg font-semibold text-foreground mb-2">4. Data Sharing</h2>
          <p class="text-muted-foreground leading-relaxed">
            We do not sell or share your personal data with third parties for advertising purposes.
            We use the following sub-processors to operate the service:
          </p>
          <ul class="list-disc list-inside text-gray-600 leading-relaxed mt-2 space-y-1">
            <li><strong>Google Firebase</strong> — authentication, cloud database, and push notifications.</li>
            <li><strong>Google Drive</strong> — optional backup of your expense data (you control this).</li>
            <li><strong>Razorpay</strong> — payment processing.</li>
          </ul>
        </section>

        <section class="mb-6">
          <h2 class="text-lg font-semibold text-foreground mb-2">5. Data Retention</h2>
          <p class="text-muted-foreground leading-relaxed">
            Your account data is retained for as long as your account is active. You may delete your
            account and all associated data at any time from the Settings page. Expense data stored
            in your Google Drive is controlled entirely by you.
          </p>
        </section>

        <section class="mb-6">
          <h2 class="text-lg font-semibold text-foreground mb-2">6. Security</h2>
          <p class="text-muted-foreground leading-relaxed">
            All data is transmitted over HTTPS. Firebase security rules ensure only you can access
            your subscription data. We do not store payment card details — payments are handled
            entirely by Razorpay on their secure servers.
          </p>
        </section>

        <section class="mb-6">
          <h2 class="text-lg font-semibold text-foreground mb-2">7. Your Rights</h2>
          <p class="text-muted-foreground leading-relaxed">
            You have the right to access, correct, or delete your personal data. To exercise these
            rights, contact us at
            <a href="mailto:support@spenza.app" class="text-primary hover:underline">support&#64;spenza.app</a>.
          </p>
        </section>

        <section class="mb-6">
          <h2 class="text-lg font-semibold text-foreground mb-2">8. Children's Privacy</h2>
          <p class="text-muted-foreground leading-relaxed">
            Spenza is not directed at children under 13. We do not knowingly collect personal
            information from children under 13.
          </p>
        </section>

        <section class="mb-6">
          <h2 class="text-lg font-semibold text-foreground mb-2">9. Changes to This Policy</h2>
          <p class="text-muted-foreground leading-relaxed">
            We may update this policy from time to time. We will notify you of significant changes
            by posting a notice in the app. Continued use of Spenza after changes constitutes
            acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">10. Contact</h2>
          <p class="text-muted-foreground leading-relaxed">
            Questions? Email us at
            <a href="mailto:support@spenza.app" class="text-primary hover:underline">support&#64;spenza.app</a>.
          </p>
        </section>
      </div>
    </div>
  `,
})
export class PrivacyComponent {}
