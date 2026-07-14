import LegalLayout, { LegalSection, ContactCard } from "../component/LegalLayout";

const toc = [
  { id: "card-data", label: "Card data" },
  { id: "security", label: "Data privacy and security" },
  { id: "third-party", label: "Third-party links" },
  { id: "changes", label: "Policy changes" },
  { id: "cookies", label: "Cookie policy" },
  { id: "contact", label: "Contact" },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy Policy" toc={toc} pageTitle="Privacy Policy - DeynoQR">
      <LegalSection id="card-data" title="Card data">
        <p>
          DeynoQR does not store credit or debit card details on its own servers, nor does it
          share card details with third parties. All card payments are processed directly through
          our approved third-party payment gateway and acquiring bank, in accordance with
          applicable payment security standards.
        </p>
      </LegalSection>

      <LegalSection id="security" title="Data privacy and security">
        <p>
          We apply reasonable technical and organisational measures to protect personal and
          transaction data collected through the DeynoQR platform, including order details,
          contact information, and reservation data. While we take reasonable steps to safeguard
          this information, no method of electronic transmission or storage is completely secure,
          and DeynoQR's liability is limited to the extent permitted under applicable UAE law.
        </p>
      </LegalSection>

      <LegalSection id="third-party" title="Third-party links">
        <p>
          The DeynoQR platform may contain links to third-party websites or services. We are not
          responsible for the content, privacy practices, or policies of any linked third-party
          website, and access to such links is at the user's own risk.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Policy changes">
        <p>
          This Privacy Policy may be updated from time to time to reflect changes in our
          practices or applicable law. Material changes will be reflected on this page with an
          updated effective date. Continued use of the DeynoQR platform after changes are posted
          constitutes acceptance of the revised policy.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="Cookie policy">
        <p>
          DeynoQR uses cookies and similar technologies to keep you signed in, remember your
          table/session context, and understand basic usage of the platform so we can improve it.
          These fall into two categories:
        </p>
        <ul className="space-y-2 list-disc list-outside pl-5">
          <li><strong>Essential cookies</strong> — required for core functionality such as maintaining an active order session and table context. These cannot be disabled.</li>
          <li><strong>Analytics cookies</strong> — help us understand how the platform is used so we can improve performance and reliability.</li>
        </ul>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <p>For questions about this Privacy Policy, contact us using the details below.</p>
        <ContactCard />
      </LegalSection>
    </LegalLayout>
  );
}
