import LegalLayout, { LegalSection, ContactCard } from "../component/LegalLayout";

const toc = [
  { id: "domicile", label: "Domicile and governing law" },
  { id: "service", label: "Nature of the service" },
  { id: "payments", label: "Payment methods and currency" },
  { id: "eligibility", label: "Eligibility" },
  { id: "cardholder", label: "Cardholder obligations" },
  { id: "confirmation", label: "Payment confirmation" },
  { id: "account", label: "Account and confidentiality" },
  { id: "pricing-description", label: "Pricing and description" },
  { id: "pricing", label: "Pricing and checkout" },
  { id: "ownership", label: "Company and ownership" },
  { id: "contact", label: "Contact" },
];

export default function TermsPage() {
  return (
    <LegalLayout title="Terms and Conditions" toc={toc} pageTitle="Terms and Conditions - DeynoQR">
      <LegalSection id="domicile" title="Domicile and governing law">
        <p>
          United Arab Emirates is our country of domicile. These Terms and Conditions, and any
          use of the DeynoQR platform, are governed by and construed in accordance with the laws
          of the United Arab Emirates.
        </p>
        <p>
          Any purchase, dispute or claim arising out of or in connection with this website shall
          be governed and construed in accordance with the laws of the United Arab Emirates
          (UAE).
        </p>
      </LegalSection>

      <LegalSection id="service" title="Nature of the service">
        <p>
          DeynoQR is a digital ordering and QR payment platform operated by{" "}
          <strong>DEYNO TECHNOLOGIES FZE</strong> ("Deyno", "we", "us"). Deyno enables customers
          to browse restaurant menus, place orders, and initiate electronic payments through the
          DeynoQR platform. Transactions are processed through Deyno's approved third-party
          payment gateway, acquiring bank, and/or payment service provider. Deyno is a technology
          service provider and is not a bank, card scheme, or financial institution.
        </p>
      </LegalSection>

      <LegalSection id="payments" title="Payment methods and currency">
        <p>
          Payments on DeynoQR are accepted via major debit and credit cards through our approved
          payment service provider. All transactions are processed in UAE Dirhams (AED) unless
          otherwise stated at checkout. DeynoQR does not accept payments from individuals or
          entities located in countries or territories subject to sanctions administered by the
          U.S. Office of Foreign Assets Control (OFAC) or equivalent UAE and international
          sanctions regimes.
        </p>
      </LegalSection>

      <LegalSection id="eligibility" title="Eligibility">
        <p>
          Use of the DeynoQR platform and its payment functionality is restricted to individuals
          who are 18 years of age or older. By placing an order or initiating a payment, you
          confirm that you meet this age requirement and that you are legally authorised to use
          the payment method provided.
        </p>
      </LegalSection>

      <LegalSection id="cardholder" title="Cardholder obligations">
        <p>
          The cardholder must retain a copy of transaction records and{" "}
          <a href="https://deynoqr.com/" className="font-medium hover:underline" style={{ color: "#780829" }}>
            https://deynoqr.com/
          </a>{" "}
          policies and rules.
        </p>
        <p>
          Cardholders are responsible for maintaining their own records of transactions made
          through the DeynoQR platform, including order confirmations and payment receipts, for
          their reference and in the event of a dispute.
        </p>
      </LegalSection>

      <LegalSection id="confirmation" title="Payment confirmation">
        <p>
          Once the payment is made, the confirmation notice will be sent to the customer via
          email within 24 hours of receipt of payment. In addition, an on-screen confirmation is
          displayed on the DeynoQR platform immediately after a successful transaction.
        </p>
      </LegalSection>

      <LegalSection id="account" title="Account and confidentiality">
        <p>
          Where an account or login is used to access DeynoQR services, the user is responsible
          for maintaining the confidentiality of their login credentials and for all activity
          that occurs under their account. Restaurants and staff accounts must not share admin
          credentials with unauthorised parties.
        </p>
      </LegalSection>

      <LegalSection id="pricing-description" title="Pricing and description">
        <p>
          <strong>Deyno QR Payment</strong> enables customers to securely pay for their
          restaurant bills by scanning a QR code and completing the payment online.
        </p>

        <div className="grid sm:grid-cols-2 gap-3 !mt-4">
          <div
            className="rounded-2xl border p-5"
            style={{ borderColor: "rgba(120,8,41,0.2)", background: "#f1e6e9" }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#933953" }}>
              Customer service fee
            </p>
            <p className="text-2xl font-bold text-zinc-900 mb-2">Up to 3.5%</p>
            <p className="text-sm">
              A convenience/service fee of up to 3.5% may be charged to customers for payments
              made through the Deyno QR Payment platform. The applicable fee will be clearly
              displayed on the checkout page before the customer confirms the payment.
            </p>
          </div>

          <div
            className="rounded-2xl border p-5"
            style={{ borderColor: "rgba(120,8,41,0.2)", background: "#f1e6e9" }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#933953" }}>
              Restaurant charges
            </p>
            <p className="text-2xl font-bold text-zinc-900 mb-2">AED 0.50</p>
            <p className="text-sm">
              Restaurants using the Deyno QR Payment platform are charged AED 0.50 per
              successful payment transaction.
            </p>
          </div>
        </div>

        <p>
          <strong>One-time setup fee.</strong> Restaurants subscribing to the Deyno QR Menu
          service may be subject to a one-time setup fee, as agreed in the merchant agreement.
        </p>
        <p>
          <strong>Payment processing.</strong> Customers who choose to pay online will be
          redirected to our secure payment checkout page to complete the transaction using
          supported payment methods. The final payable amount, including any applicable service
          fee, will be displayed before payment confirmation.
        </p>
      </LegalSection>

      <LegalSection id="pricing" title="Pricing and checkout">
        <p>
          The price and currency displayed at checkout will match the amount reflected on the
          order receipt and the amount charged to the customer's payment card. Any discrepancy
          should be reported to us immediately using the contact details below.
        </p>
      </LegalSection>

      <LegalSection id="ownership" title="Company and ownership">
        <p>
          The DeynoQR platform, including its name, branding, and underlying technology, is owned
          and operated by DEYNO TECHNOLOGIES FZE, a company registered in Sharjah, United Arab
          Emirates. All rights not expressly granted under these Terms are reserved.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <p>For questions about these Terms and Conditions, contact us using the details below.</p>
        <ContactCard />
      </LegalSection>
    </LegalLayout>
  );
}
