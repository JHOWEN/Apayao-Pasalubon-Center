import { Suspense } from "react";
import LegalPageNavigation, { LegalPageNavigationFallback } from "@/components/auth/legal-page-navigation";

const sections = [
  {
    title: "Account use",
    text: "You are responsible for keeping your account details accurate and secure. Do not share your login information with anyone else.",
  },
  {
    title: "Orders and pickup",
    text: "Orders are subject to product availability, payment approval, and store confirmation. For pickup orders, please arrive on time and follow the stated collection instructions.",
  },
  {
    title: "Payments and cancellations",
    text: "Payments must be valid and approved before an order is completed. Orders may be cancelled or refused if they appear invalid, fraudulent, or abusive.",
  },
  {
    title: "Platform conduct",
    text: "Please use the site lawfully and respectfully. Misuse, fraud, unauthorized access, or abusive behavior may lead to account restriction or removal.",
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-6 border-b border-slate-200 pb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-orange-500">Apayao Pasalubong Center</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Terms and Conditions</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
            These are the main rules for using our storefront and placing orders.
          </p>
        </div>

        <div>
          {sections.map((section, index) => (
            <section key={section.title} className={index === 0 ? "py-5" : "border-t border-slate-200 py-5"}>
              <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">{section.text}</p>
            </section>
          ))}
        </div>

        <div className="mt-8 border-t border-slate-200 pt-5 text-sm leading-7 text-slate-600">
          By continuing to use the platform, you agree to these terms.
        </div>

        <Suspense fallback={<LegalPageNavigationFallback page="terms" />}>
          <LegalPageNavigation page="terms" />
        </Suspense>
      </div>
    </main>
  );
}
