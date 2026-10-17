import { Suspense } from "react";
import LegalPageNavigation, { LegalPageNavigationFallback } from "@/components/auth/legal-page-navigation";

const sections = [
  {
    title: "What we collect",
    text: "We collect the information needed to create your account, process orders, and provide support. This includes your name, email, contact details, and order history.",
  },
  {
    title: "How we use it",
    text: "Your data is used to securely manage your account, confirm orders, respond to support requests, and prevent fraud or misuse.",
  },
  {
    title: "How we protect it",
    text: "We use reasonable security measures to help protect your personal information from unauthorized access or misuse.",
  },
  {
    title: "What we do not do",
    text: "We do not sell your personal information for marketing purposes. We only share data when necessary to complete orders or comply with the law.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-6 border-b border-slate-200 pb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-orange-500">Apayao Pasalubong Center</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Privacy Policy</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
            Your privacy matters. This summary explains the key details of how your information is handled when you use our store.
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
          If you need help with your personal data, please contact the store through the available support channels.
        </div>

        <Suspense fallback={<LegalPageNavigationFallback page="privacy" />}>
          <LegalPageNavigation page="privacy" />
        </Suspense>
      </div>
    </main>
  );
}
