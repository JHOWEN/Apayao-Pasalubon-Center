import Link from "next/link";

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

export default async function TermsPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const fromRegistration = (await searchParams).from === "register";
  const backHref = fromRegistration ? "/register" : "/";
  const backLabel = fromRegistration ? "Back to registration" : "Back to store";
  const privacyHref = fromRegistration ? "/privacy?from=register" : "/privacy?from=store";

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

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={backHref} className="inline-flex rounded-2xl bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-orange-600">
            {backLabel}
          </Link>
          <Link href={privacyHref} className="inline-flex rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            Read privacy policy
          </Link>
        </div>
      </div>
    </main>
  );
}
