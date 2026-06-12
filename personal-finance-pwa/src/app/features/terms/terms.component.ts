import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-terms',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="min-h-screen bg-gray-50 py-10 px-4">
      <div class="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm p-8">
        <a routerLink="/" class="text-sm text-primary hover:underline mb-6 inline-block">&larr; Back to Spenza</a>

        <h1 class="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p class="text-sm text-gray-500 mb-8">Last updated: June 1, 2026</p>

        <section class="mb-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-2">1. Acceptance of Terms</h2>
          <p class="text-gray-600 leading-relaxed">
            By using Spenza ("the App"), you agree to these Terms of Service. If you do not agree,
            please discontinue use immediately.
          </p>
        </section>

        <section class="mb-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-2">2. Description of Service</h2>
          <p class="text-gray-600 leading-relaxed">
            Spenza is a personal expense tracking application available on Android and the web.
            It offers a free tier and a Pro tier with additional features.
          </p>
        </section>

        <section class="mb-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-2">3. User Accounts</h2>
          <p class="text-gray-600 leading-relaxed">
            You must sign in with a valid Google account. You are responsible for maintaining the
            security of your account and all activity that occurs under it.
          </p>
        </section>

        <section class="mb-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-2">4. Subscriptions and Payments</h2>
          <ul class="list-disc list-inside text-gray-600 leading-relaxed space-y-1">
            <li>Pro Monthly: ₹499/month (India) or equivalent in other currencies.</li>
            <li>Pro Yearly: ₹3,999/year (India) or equivalent in other currencies.</li>
            <li>Subscriptions auto-renew unless cancelled at least 24 hours before the renewal date.</li>
            <li>Payments are processed by Razorpay. No card details are stored by us.</li>
            <li>Refunds are handled at our discretion within 7 days of purchase if the service is materially not as described.</li>
          </ul>
        </section>

        <section class="mb-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-2">5. Free Tier</h2>
          <p class="text-gray-600 leading-relaxed">
            The free tier provides core expense tracking features. Pro features (advanced insights,
            family sync, and others) require an active Pro subscription.
          </p>
        </section>

        <section class="mb-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-2">6. Acceptable Use</h2>
          <p class="text-gray-600 leading-relaxed">
            You agree not to misuse the App, attempt to reverse-engineer it, or use it in a manner
            that violates any applicable law or regulation.
          </p>
        </section>

        <section class="mb-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-2">7. Data and Backups</h2>
          <p class="text-gray-600 leading-relaxed">
            You are responsible for maintaining backups of your expense data. While we take
            reasonable measures to protect data, we are not liable for data loss. Your data stored
            in Google Drive is governed by Google's Terms of Service.
          </p>
        </section>

        <section class="mb-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-2">8. Disclaimer of Warranties</h2>
          <p class="text-gray-600 leading-relaxed">
            The App is provided "as is" without warranties of any kind. We do not guarantee that
            the App will be error-free or available at all times.
          </p>
        </section>

        <section class="mb-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-2">9. Limitation of Liability</h2>
          <p class="text-gray-600 leading-relaxed">
            To the maximum extent permitted by law, Spenza is not liable for any indirect,
            incidental, or consequential damages arising from your use of the App.
          </p>
        </section>

        <section class="mb-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-2">10. Governing Law</h2>
          <p class="text-gray-600 leading-relaxed">
            These Terms are governed by the laws of India. Any disputes shall be resolved in the
            courts of Chennai, Tamil Nadu, India.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-gray-800 mb-2">11. Contact</h2>
          <p class="text-gray-600 leading-relaxed">
            For questions about these Terms, email
            <a href="mailto:support@spenza.app" class="text-primary hover:underline">support&#64;spenza.app</a>.
          </p>
        </section>
      </div>
    </div>
  `,
})
export class TermsComponent {}
