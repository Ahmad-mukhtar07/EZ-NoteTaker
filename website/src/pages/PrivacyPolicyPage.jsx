import { Link } from 'react-router-dom';
import { Container } from '../components/ui/Container';
import { Section } from '../components/ui/Section';
import { productName } from '../content/placeholders';
import './PrivacyPolicyPage.css';

export function PrivacyPolicyPage() {
  return (
    <div className="privacy-page">
      <Section>
        <Container className="privacy-page__container">
          <Link to="/" className="privacy-page__back">
            ← Back to home
          </Link>
          <h1 className="privacy-page__title">Privacy Policy</h1>
          <p className="privacy-page__updated">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <div className="privacy-page__content">
            <p className="privacy-page__intro">
              This Privacy Policy describes how {productName} (“we”, “our”, or “us”) collects, uses, and shares
              information when you use our Chrome extension and related website (collectively, the “Service”).
            </p>

            <section className="privacy-page__section">
              <h2 className="privacy-page__heading">1. Information we collect</h2>
              <p>
                <strong>Account information.</strong> When you sign in with Google, we receive your email address and
                name from Google. We use this to create and manage your account and to link your usage (e.g. snips and
                connected documents) to your profile.
              </p>
              <p>
                <strong>Snip data.</strong> When you use the extension to capture text or images from web pages, we
                store the snippet content, the source URL, page title, and domain. This data is stored in our database
                so you can insert snips into your connected Google Doc and view source information. Image snips may
                be stored (e.g. in cloud storage we use) to support insertion into your doc.
              </p>
              <p>
                <strong>Google Doc linkage.</strong> We store identifiers that link your account to the Google Docs you
                connect (e.g. document ID). We do not read or store the full content of your Google Docs beyond what
                is necessary to insert snips and format references.
              </p>
              <p>
                <strong>Payment information.</strong> If you subscribe to Pro, payment is processed by Stripe. We do
                not store your full card number; we receive and store limited billing-related data (e.g. subscription
                status, customer ID) from Stripe to provide Pro features and support.
              </p>
            </section>

            <section className="privacy-page__section">
              <h2 className="privacy-page__heading">2. How we use your information</h2>
              <p>
                We use the information above to provide, operate, and improve the Service (e.g. storing snips,
                inserting into your doc, managing your plan), to communicate with you about your account or
                subscription, and to comply with legal obligations. We do not sell your personal information to
                third parties.
              </p>
            </section>

            <section className="privacy-page__section">
              <h2 className="privacy-page__heading">3. Third-party services</h2>
              <p>
                We rely on the following third parties, each of which has its own privacy policy:
              </p>
              <ul>
                <li>
                  <strong>Google</strong> — for sign-in (OAuth) and for Google Docs integration. Google’s privacy
                  policy applies to your use of Google services.
                </li>
                <li>
                  <strong>Supabase</strong> — for authentication, database, and storage. Your account and snip data
                  are stored on Supabase infrastructure.
                </li>
                <li>
                  <strong>Stripe</strong> — for payment processing when you subscribe to Pro. Stripe’s privacy
                  policy applies to payment data.
                </li>
              </ul>
            </section>

            <section className="privacy-page__section">
              <h2 className="privacy-page__heading">4. Data retention and security</h2>
              <p>
                We retain your account and snip data for as long as your account is active. You can delete snips
                within the extension. If you close your account, we will delete or anonymize your data in line with
                our retention practices. We use industry-standard measures (e.g. encryption, access controls) to
                protect your data.
              </p>
            </section>

            <section className="privacy-page__section">
              <h2 className="privacy-page__heading">5. Your rights</h2>
              <p>
                Depending on where you live, you may have rights to access, correct, delete, or port your personal
                data, or to object to or restrict certain processing. To exercise these rights or ask questions
                about this policy, contact us at the email below.
              </p>
            </section>

            <section className="privacy-page__section">
              <h2 className="privacy-page__heading">6. Changes</h2>
              <p>
                We may update this Privacy Policy from time to time. We will post the updated policy on this page
                and update the “Last updated” date. Continued use of the Service after changes constitutes
                acceptance of the updated policy.
              </p>
            </section>

            <section className="privacy-page__section">
              <h2 className="privacy-page__heading">7. Contact</h2>
              <p>
                For privacy-related questions or requests, contact us at{' '}
                <a href="mailto:ahmadmukhtar2001@gmail.com" className="privacy-page__link">
                  ahmadmukhtar2001@gmail.com
                </a>.
              </p>
            </section>
          </div>
        </Container>
      </Section>
    </div>
  );
}
