'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';

/**
 * Centralized legal/contact configuration.
 * Update these values once and they will reflect across this page.
 */
const LEGAL = {
  appName: 'G1',
  companyLegalName: 'G1 Technologies Private Limited', // <-- replace with your legal entity name
  contactEmail: 'hello@g1.com', // <-- replace with your official privacy/support email
  grievanceEmail: 'hello@g1.com', // <-- grievance redressal email (can be same)
  cityState: 'Mumbai, Maharashtra, India',
  websiteUrl: 'https://g1-ssr.vercel.app', // <-- replace with your real domain
  effectiveDate: '2026-02-26', // <-- set your effective date
  lastUpdated: '2026-02-26', // <-- update when you change content
};

const PrivacyPolicyLayout = () => {
  const [menu, setMenu] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);

  const nav = (id: string) => {
    setMenu(false);
    if (id === 'login') return (window.location.href = '/auth/login');
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const [activeSection, setActiveSection] = useState('intro');
  const contentRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const sections = [
    { id: 'intro', title: 'Introduction' },
    { id: 'who-are-we', title: 'Who are we?' },
    { id: 'types-info', title: 'Types of information we collect' },
    { id: 'how-use', title: 'How we use your personal data and why' },
    { id: 'how-collect', title: 'How we collect your personal data' },
    { id: 'who-share', title: 'Who we share your personal data with' },
    { id: 'your-rights', title: 'Your rights and choices' },
    { id: 'security', title: 'Security, integrity, and retention' },
    { id: 'transfers', title: 'Data transfers, storage and processing' },
    { id: 'cookies', title: 'Cookies and tracking technologies' },
  ];

  const handleSectionClick = (sectionId: string) => {
    const element = sectionRefs.current[sectionId];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setActiveSection(sectionId);
      setTocOpen(false);
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      if (!contentRef.current) return;

      const contentTop = contentRef.current.getBoundingClientRect().top;
      let currentSection = 'intro';
      let smallestDistance = Infinity;

      Object.entries(sectionRefs.current).forEach(([id, element]) => {
        if (!(element instanceof HTMLElement)) return;
        const distance = Math.abs(element.getBoundingClientRect().top - contentTop - 100);
        if (distance < smallestDistance) {
          smallestDistance = distance;
          currentSection = id;
        }
      });

      setActiveSection(currentSection);
    };

    const scrollContainer = contentRef.current;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }
  }, []);

  return (
    <div className="relative">
      <nav className="sticky top-0 z-50 bg-white">
        <div className="flex items-center justify-between px-6 py-4 md:grid md:grid-cols-3 md:gap-0">
          {/* LOGO */}
          <div className="flex gap-2 items-center md:justify-start">
            <div className="w-8 h-8 bg-gradient-to-r from-[#14b8a6] to-[#134E4A] rounded-lg" />
            <p className="font-bold text-[#14b8a6] text-xl">{LEGAL.appName}</p>
            <Link
              href="/landing-page"
              className="inline-flex whitespace-nowrap text-xs font-semibold text-[#134E4A] transition hover:text-[#14b8a6] sm:text-sm"
            >
              ← Back to Landing Page
            </Link>
          </div>

          {/* DESKTOP NAV CENTER */}
          <div className="hidden md:flex gap-4 justify-center"></div>

          {/* RIGHT SIDE BUTTONS */}
          <div className="flex items-center gap-3 md:justify-end">
            <button
              onClick={() => nav('login')}
              className="bg-gradient-to-r from-[#14b8a6] to-[#134E4A] text-white px-4 py-2 rounded-full font-semibold hover:from-[#134E4A] hover:to-[#14b8a6] transition"
            >
              Get Started
            </button>

            <button onClick={() => setMenu(!menu)} className="md:hidden">
              {menu ? <X className="text-[#134e4a]" /> : <Menu className="text-[#134e4a]" />}
            </button>
          </div>
        </div>

        {/* MOBILE DROPDOWN */}
        {menu && (
          <div className="bg-white shadow-md md:hidden z-[60]">
            <Link
              href="/landing-page"
              onClick={() => setMenu(false)}
              className="block px-6 py-4 text-left text-[#134E4A] w-full"
            >
              ← Back to Landing Page
            </Link>
            <hr className="w-full border-gray-300" />
            {[
              ['Get Started', 'login'],
              ['Contact', 'footer'],
            ].map(([t, id], index, array) => (
              <div key={id}>
                <button
                  onClick={() => nav(id)}
                  className="block px-6 py-4 text-left text-[#134E4A] w-full"
                >
                  {t}
                </button>
                {index < array.length - 1 && <hr className="w-full border-gray-300" />}
              </div>
            ))}
          </div>
        )}

        <div className="h-0.5 bg-gradient-to-r from-[#134E4A] to-[#14b8a6]"></div>
      </nav>

      <div className="flex min-h-screen bg-white">
        {/* Left Sidebar - Table of Contents */}
        <div className="hidden w-72 border-r border-gray-300 overflow-y-auto md:block">
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-6 text-black">Contents</h2>
            <nav className="space-y-3">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => handleSectionClick(section.id)}
                  className={`block w-full text-left px-3 py-2 rounded transition-colors ${
                    activeSection === section.id
                      ? 'text-[#14b8a6] font-semibold bg-[#14b8a6]/10'
                      : 'text-gray-700 hover:text-gray-900'
                  }`}
                >
                  {section.title}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {tocOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              aria-label="Close contents menu"
              className="absolute inset-0 bg-black/40"
              onClick={() => setTocOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full w-72 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-black">Contents</h2>
                <button
                  type="button"
                  aria-label="Close contents"
                  className="text-gray-600"
                  onClick={() => setTocOpen(false)}
                >
                  <X />
                </button>
              </div>
              <nav className="space-y-3 px-6 py-4">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => handleSectionClick(section.id)}
                    className={`block w-full text-left px-3 py-2 rounded transition-colors ${
                      activeSection === section.id
                        ? 'text-[#14b8a6] font-semibold bg-[#14b8a6]/10'
                        : 'text-gray-700 hover:text-gray-900'
                    }`}
                  >
                    {section.title}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        )}

        {/* Right Content Area */}
        <div ref={contentRef} className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-8 py-8">
            <div className="mb-6 flex justify-end md:hidden">
              <button
                type="button"
                onClick={() => setTocOpen(true)}
                className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-[#134E4A]"
              >
                Contents
              </button>
            </div>

            {/* Header */}
            <div className="mb-12">
              <p className="text-sm text-gray-600 mb-4">
                Effective Date: {LEGAL.effectiveDate} · Last Updated: {LEGAL.lastUpdated}
              </p>
              <h1 className="text-5xl font-serif text-black mb-4">{LEGAL.appName} Privacy Policy</h1>
              <p className="text-gray-700 leading-relaxed">
                This Privacy Policy describes how {LEGAL.companyLegalName} (“{LEGAL.appName}”, “we”, “our”, “us”)
                collects, uses, shares, and protects personal data when you use our website{' '}
                <a href={LEGAL.websiteUrl} className="text-blue-600 hover:underline">
                  {LEGAL.websiteUrl}
                </a>{' '}
                (the “Site”), our application and platform, or when you contact us.
              </p>
              <p className="text-gray-700 leading-relaxed mt-3">
                We are currently focused on users in India and aim to align our practices with applicable Indian laws,
                including the Digital Personal Data Protection Act, 2023 (“DPDP Act”).
              </p>
            </div>

            {/* Introduction */}
            <section
              ref={(el) => {
                sectionRefs.current['intro'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Introduction</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We understand that privacy policies can be hard to read. We’ve tried to keep this one clear and
                straightforward. If you have questions, contact us at{' '}
                <a href={`mailto:${LEGAL.contactEmail}`} className="text-blue-600 hover:underline">
                  {LEGAL.contactEmail}
                </a>
                .
              </p>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 text-gray-700">
                <p className="font-semibold text-black mb-2">Important note</p>
                <p className="leading-relaxed">
                  {LEGAL.appName} helps you store and organize medical documents and health information. {LEGAL.appName}{' '}
                  is not a healthcare provider and does not provide medical advice, diagnosis, or treatment.
                </p>
              </div>
            </section>

            {/* Who are we */}
            <section
              ref={(el) => {
                sectionRefs.current['who-are-we'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Who are we?</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                {LEGAL.appName} is a digital health information management platform. It allows users to create a secure
                account, upload and store medical documents, and access summaries or extracted information from their
                own content (where such features are enabled).
              </p>
              <p className="text-gray-700 leading-relaxed">
                We do not replace professional medical advice, diagnosis, or treatment. Always consult a qualified
                healthcare professional for medical decisions.
              </p>
            </section>

            {/* Types of info */}
            <section
              ref={(el) => {
                sectionRefs.current['types-info'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Types of information we collect</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We may collect the following categories of information depending on how you use {LEGAL.appName}:
              </p>

              <p className="text-gray-700 leading-relaxed">
                <span className="font-semibold text-black">• Account and identity information:</span> name, email
                address, and basic profile information you choose to provide (for example, profile photo).
                <br />
                <span className="font-semibold text-black">• Contact information:</span> email address and optional phone
                number (if you provide it).
                <br />
                <span className="font-semibold text-black">• Health and medical information:</span> medical reports,
                prescriptions, bills, appointment details, notes, and other health-related files you upload or enter.
                <br />
                <span className="font-semibold text-black">• Usage data:</span> interactions with the platform, pages or
                features used, and activity logs (where applicable).
                <br />
                <span className="font-semibold text-black">• Technical data:</span> IP address, device type, browser,
                operating system, and server logs.
                <br />
                <span className="font-semibold text-black">• Authentication/security data:</span> login sessions,
                verification tokens, and security-related events (stored and processed securely).
              </p>

              <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-5 text-gray-700">
                <p className="font-semibold text-black mb-2">Care Circle / Family Profiles</p>
                <p className="leading-relaxed">
                  If you upload or manage data for family members or other individuals, you confirm you have their valid
                  consent or lawful authority to do so. You are responsible for ensuring you share and manage such data
                  lawfully.
                </p>
              </div>

              <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-5 text-gray-700">
                <p className="font-semibold text-black mb-2">Children</p>
                <p className="leading-relaxed">
                  {LEGAL.appName} is intended for users who are at least 18 years old. We do not knowingly collect
                  personal data from children. If you believe a child has provided us personal data, please contact us.
                </p>
              </div>
            </section>

            {/* How we use data */}
            <section
              ref={(el) => {
                sectionRefs.current['how-use'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">How we use your personal data and why</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We use personal data for the following purposes:
              </p>

              <p className="text-gray-700 leading-relaxed">
                • To create and manage your {LEGAL.appName} account
                <br />• To store, organize, and display the content you upload (medical reports, prescriptions, bills,
                appointment information)
                <br />• To provide optional features such as document summaries or extracted information from your own
                uploads (where enabled)
                <br />• To maintain platform security, prevent abuse, and detect unauthorized access
                <br />• To provide customer support and respond to inquiries
                <br />• To communicate service-related messages (for example, security alerts or important notices)
                <br />• To comply with legal obligations and enforce our Terms
              </p>

              <p className="text-gray-700 leading-relaxed mt-4">
                We do not use health data for advertising or marketing purposes.
              </p>

              <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-5 text-gray-700">
                <p className="font-semibold text-black mb-2">Legal basis (India)</p>
                <p className="leading-relaxed">
                  We process personal data with your consent where required, and for other lawful purposes consistent
                  with applicable Indian law (including legitimate uses such as security, fraud prevention, and providing
                  requested services).
                </p>
              </div>
            </section>

            {/* How we collect */}
            <section
              ref={(el) => {
                sectionRefs.current['how-collect'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">How we collect your personal data</h2>
              <p className="text-gray-700 leading-relaxed mb-4">We collect personal data through:</p>
              <p className="text-gray-700 leading-relaxed">
                • Information you provide directly during signup and profile setup
                <br />• Medical reports, images, files, and information you upload or enter voluntarily
                <br />• Your use of platform features (for example, viewing, uploading, searching, and organizing records)
                <br />• Automated technologies such as cookies and server logs
                <br />• Communications you send to us (for example, support requests)
              </p>
            </section>

            {/* Sharing */}
            <section
              ref={(el) => {
                sectionRefs.current['who-share'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Who we share your personal data with</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We do not sell or rent your personal data.
              </p>
              <p className="text-gray-700 leading-relaxed">
                We may share limited personal data with:
                <br />• <span className="font-semibold text-black">Service providers</span> who help us operate the
                platform (for example, hosting, database, storage, email delivery, analytics if enabled, and security
                monitoring). These providers act on our instructions to provide services to us.
                <br />• <span className="font-semibold text-black">Legal or regulatory authorities</span> where required
                by law or a lawful request.
                <br />• <span className="font-semibold text-black">Professional advisors</span> (such as lawyers or
                auditors) where necessary for compliance or protection of legal rights.
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                We require third parties to apply appropriate security and confidentiality obligations.
              </p>
            </section>

            {/* Rights */}
            <section
              ref={(el) => {
                sectionRefs.current['your-rights'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Your rights and choices</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Subject to applicable Indian law (including the DPDP Act), you may have rights to:
              </p>
              <p className="text-gray-700 leading-relaxed">
                • Access information about the personal data we process about you
                <br />• Correct inaccurate or incomplete personal data
                <br />• Request deletion of personal data (subject to lawful exceptions)
                <br />• Withdraw consent where processing is based on consent
                <br />• Raise concerns or lodge a grievance
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                To exercise these rights, contact us at{' '}
                <a href={`mailto:${LEGAL.contactEmail}`} className="text-blue-600 hover:underline">
                  {LEGAL.contactEmail}
                </a>
                . If you have a grievance, you can also email{' '}
                <a href={`mailto:${LEGAL.grievanceEmail}`} className="text-blue-600 hover:underline">
                  {LEGAL.grievanceEmail}
                </a>
                .
              </p>
            </section>

            {/* Security + retention */}
            <section
              ref={(el) => {
                sectionRefs.current['security'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">
                Security, integrity, and retention of your personal data
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We implement reasonable technical and organizational measures intended to protect your data, such as:
              </p>
              <p className="text-gray-700 leading-relaxed">
                • Secure authentication and access controls
                <br />• Encryption in transit (for example, HTTPS/TLS) and encryption at rest where applicable
                <br />• Restricted internal access and least-privilege permissions
                <br />• Monitoring and logging to help detect suspicious activity
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                <span className="font-semibold text-black">Retention:</span> We retain personal data for as long as your
                account is active or as necessary to provide the services you request. You may request deletion of your
                account and associated data. After deletion, some information may be retained if required by law or for
                legitimate purposes such as security, fraud prevention, backups, or dispute resolution. Backup copies, if
                any, may persist for a limited period based on our retention cycles.
              </p>
            </section>

            {/* Transfers */}
            <section
              ref={(el) => {
                sectionRefs.current['transfers'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Data transfers, storage and processing</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Your personal data may be stored and processed on secure servers operated by {LEGAL.appName} or trusted
                service providers.
              </p>
              <p className="text-gray-700 leading-relaxed">
                Depending on the infrastructure we use, your data may be processed or stored outside India. When this
                occurs, we take steps intended to ensure an appropriate level of protection consistent with applicable
                law and contractual safeguards with service providers.
              </p>
            </section>

            {/* Cookies */}
            <section
              ref={(el) => {
                sectionRefs.current['cookies'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Cookies and tracking technologies</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                {LEGAL.appName} uses cookies and similar technologies to:
              </p>
              <p className="text-gray-700 leading-relaxed">
                • Maintain user sessions and authentication
                <br />• Improve platform performance and usability
                <br />• Remember preferences
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                You can control cookie usage through browser settings. Disabling cookies may affect platform features.
                For details, see our{' '}
                <Link href="/legal/cookie-policy" className="text-blue-600 hover:underline">
                  Cookie Policy
                </Link>
                .
              </p>

              <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-5 text-gray-700">
                <p className="font-semibold text-black mb-2">Related pages</p>
                <p className="leading-relaxed">
                  For enhanced details on sensitive health information, see{' '}
                  <Link href="/legal/health-data-privacy" className="text-blue-600 hover:underline">
                    Health Data Privacy & Security
                  </Link>
                  .
                </p>
              </div>
            </section>

            <div className="h-20" />
          </div>
        </div>
      </div>

      <footer id="footer" className="bg-gray-900 text-white py-8 md:py-4">
        <div className="max-w-6xl mx-auto px-4">
          {/* DESKTOP FOOTER */}
          <div className="hidden md:grid md:grid-cols-3 gap-8">
            {/* BRAND */}
            <div className="md:col-span-1">
              <div className="flex gap-2 items-center mb-4">
                <div className="w-8 h-8 bg-gradient-to-r from-[#14b8a6] to-[#134E4A] rounded-lg" />
                <p className="font-bold text-[#14b8a6] text-xl">{LEGAL.appName}</p>
              </div>
              <p className="text-gray-400 text-sm">
                Healthcare, beautifully reimagined. Your health. Your family. Your control.
              </p>
              <p className="text-gray-500 text-xs mt-3">
                {LEGAL.companyLegalName} · {LEGAL.cityState}
              </p>
            </div>

            {/* CONTACT US */}
            <div className="md:col-span-1">
              <h3 className="font-semibold text-lg mb-4">Contact Us</h3>
              <div className="space-y-2 text-gray-400 text-sm">
                <p>
                  Email:{' '}
                  <a href={`mailto:${LEGAL.contactEmail}`} className="hover:underline">
                    {LEGAL.contactEmail}
                  </a>
                </p>
                <p>
                  Grievance:{' '}
                  <a href={`mailto:${LEGAL.grievanceEmail}`} className="hover:underline">
                    {LEGAL.grievanceEmail}
                  </a>
                </p>
                <p>Location: {LEGAL.cityState}</p>
              </div>
            </div>

            {/* LEGAL */}
            <div className="md:col-span-1">
              <h3 className="font-semibold text-lg mb-4">Legal</h3>
              <div className="space-y-2 text-gray-400 text-sm">
                <Link href="/legal/privacy-policy" className="block hover:text-white transition">
                  Privacy Policy
                </Link>
                <Link href="/legal/terms-of-service" className="block hover:text-white transition">
                  Terms of Service
                </Link>
                <Link href="/legal/cookie-policy" className="block hover:text-white transition">
                  Cookie Policy
                </Link>
                <Link href="/legal/health-data-privacy" className="block hover:text-white transition">
                  Health Data Privacy
                </Link>
              </div>
            </div>
          </div>

          {/* MOBILE FOOTER */}
          <div className="md:hidden">
            <div className="flex gap-2 items-center">
              <div className="w-6 h-6 bg-gradient-to-r from-[#14b8a6] to-[#134E4A] rounded-lg" />
              <p className="font-bold text-[#14b8a6] text-lg">{LEGAL.appName}</p>
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-xs mb-1">Contact Us</h3>
                <div className="space-y-0.5 text-gray-400 text-xs">
                  <p>
                    Email:{' '}
                    <a href={`mailto:${LEGAL.contactEmail}`} className="hover:underline">
                      {LEGAL.contactEmail}
                    </a>
                  </p>
                  <p>
                    Grievance:{' '}
                    <a href={`mailto:${LEGAL.grievanceEmail}`} className="hover:underline">
                      {LEGAL.grievanceEmail}
                    </a>
                  </p>
                  <p>Location: {LEGAL.cityState}</p>
                </div>
              </div>

              <div className="flex-1">
                <h3 className="font-semibold text-xs mb-1">Legal</h3>
                <div className="space-y-0.5 text-gray-400 text-xs">
                  <Link href="/legal/privacy-policy" className="block hover:text-white transition">
                    Privacy Policy
                  </Link>
                  <Link href="/legal/terms-of-service" className="block hover:text-white transition">
                    Terms of Service
                  </Link>
                  <Link href="/legal/cookie-policy" className="block hover:text-white transition">
                    Cookie Policy
                  </Link>
                  <Link href="/legal/health-data-privacy" className="block hover:text-white transition">
                    Health Data Privacy
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-8 pt-8 text-center hidden md:block">
            <p className="text-gray-400 text-sm">© {new Date().getFullYear()} {LEGAL.appName}. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PrivacyPolicyLayout;
