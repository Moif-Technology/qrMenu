import LegalLayout, { LegalSection, ContactCard } from "../component/LegalLayout";

const toc = [
  { id: "who-we-are", label: "Who we are" },
  { id: "what-we-do", label: "What we do" },
  { id: "contact", label: "Contact details" },
];

export default function AboutUsPage() {
  return (
    <LegalLayout title="About Us" toc={toc} pageTitle="About Us - DeynoQR">
      <LegalSection id="who-we-are" title="Who we are">
        <p>
          DeynoQR is a digital ordering and payment platform for restaurants, built and operated
          by <strong>DEYNO TECHNOLOGIES FZE</strong>, registered in Sharjah, United Arab Emirates.
          We provide QR-code based menus, in-seat ordering, table reservations, waitlist
          management, and integrated payment/bill-splitting tools so restaurants can serve guests
          faster without extra hardware.
        </p>
      </LegalSection>

      <LegalSection id="what-we-do" title="What we do">
        <p>
          Guests scan a QR code at their table to browse the menu, place orders, and pay directly
          from their phone. Restaurant staff manage menus, orders, reservations, and reports
          through our admin dashboard. DeynoQR acts as the technology and payment facilitation
          partner between restaurants and their guests.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact details">
        <ContactCard />
      </LegalSection>
    </LegalLayout>
  );
}
