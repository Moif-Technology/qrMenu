import LegalLayout, { LegalSection, ContactCard } from "../component/LegalLayout";

const toc = [
  { id: "cancellation", label: "Order cancellation" },
  { id: "refunds", label: "Refunds and chargebacks" },
  { id: "timeline", label: "Refund timeline" },
  { id: "contact", label: "Contact" },
];

const chargebackClauses = [
  `Refunds are subject to the applicable payment service provider's rules and technical capabilities.`,
  `Automated Refund Transaction Fee: AED 90 per automated Refund Transaction.`,
  `Original Transaction Fees and applicable processing charges are non-refundable following a Refund.`,
  `The Merchant is responsible for chargebacks, payment disputes, reversals, and related charges arising from Merchant Transactions.`,
  `Deyno may deduct Refunds, Chargebacks, reversals, disputes, and related fees from current or future Settlement amounts.`,
  `The Merchant shall provide transaction records and supporting documents reasonably requested to respond to payment disputes or Chargebacks.`,
];

export default function RefundPolicyPage() {
  return (
    <LegalLayout title="Refund & Cancellation Policy" toc={toc} pageTitle="Refund & Cancellation Policy - DeynoQR">
      <LegalSection id="cancellation" title="Order cancellation">
        <p>
          An order can be cancelled free of charge only before the restaurant has started
          preparing it. Once preparation has begun, the order can no longer be cancelled through
          DeynoQR — contact restaurant staff directly at the table or venue for further
          assistance.
        </p>
      </LegalSection>

      <LegalSection id="refunds" title="Refunds and chargebacks">
        <ol className="space-y-3 list-decimal list-outside pl-5">
          {chargebackClauses.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ol>
      </LegalSection>

      <LegalSection id="timeline" title="Refund timeline">
        <p>
          Approved refunds are credited back to the original payment method within 10 to 45
          business days, depending on the processing timelines of the customer's card issuer or
          payment provider.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <p>To request a refund or raise a dispute, reach us using the details below.</p>
        <ContactCard />
      </LegalSection>
    </LegalLayout>
  );
}
