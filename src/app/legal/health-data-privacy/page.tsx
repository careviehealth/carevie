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
  companyLegalName: 'G1 Technologies Private Limited', // <-- replace with your actual legal entity name
  contactEmail: 'hello@g1.com', // <-- replace with your official support/legal email
  grievanceEmail: 'hello@g1.com', // <-- can be same as contactEmail
  cityState: 'Mumbai, Maharashtra, India',
  effectiveDate: '2026-02-26', // <-- set your effective date
  lastUpdated: '2026-02-26', // <-- update when you change content
};

const HealthDataPrivacyLayout = () => {
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
    { id: 'our-commitment', title: 'Our commitment to health data protection' },
    { id: 'what-is-health-data', title: 'What is considered health data?' },
    { id: 'lawful-basis', title: 'Lawful basis and user consent' },
    { id: 'purpose', title: 'Purpose of processing health data' },
    { id: 'data-minimization', title: 'Data minimization and access control' },
    { id: 'data-security-measures', title: 'Data security measures' },
    { id: 'data-sharing', title: 'Data sharing and third-party processing' },
    { id: 'retention', title: 'Retention and deletion' },
    { id: 'your-rights-health-data', title: 'Your rights regarding health data' },
    { id: 'ai-specific-considerations', title: 'AI-specific considerations' },
    { id: 'updates', title: 'Updates to this page' },
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
              <h1 className="text-5xl font-serif text-black mb-4">
                {LEGAL.appName} Health Data Privacy & Security
              </h1>
              <p className="text-gray-700 leading-relaxed">
                This page supplements our{' '}
                <Link href="/legal/privacy-policy" className="text-blue-600 hover:underline">
                  Privacy Policy
                </Link>{' '}
                and explains how we handle health-related information with enhanced safeguards. If you have questions,
                contact us at{' '}
                <a href={`mailto:${LEGAL.contactEmail}`} className="text-blue-600 hover:underline">
                  {LEGAL.contactEmail}
                </a>
                .
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
                {LEGAL.appName} is a platform that helps users store, organize, and access medical records (such as lab
                reports, prescriptions, bills, and appointment details). We are committed to protecting the privacy,
                confidentiality, and security of health-related information.
              </p>
              <p className="text-gray-700 leading-relaxed">
                {LEGAL.appName} is not a healthcare provider and does not provide medical advice, diagnosis, or
                treatment. For medical decisions, consult a qualified healthcare professional.
              </p>
            </section>

            {/* Our commitment */}
            <section
              ref={(el) => {
                sectionRefs.current['our-commitment'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">
                Our commitment to health data protection
              </h2>
              <p className="text-gray-700 leading-relaxed">
                Health-related information is sensitive. We aim to handle personal and health data responsibly,
                transparently, and securely. Our practices are designed to align with applicable Indian laws and
                generally accepted security practices, including:
                <br />
                <span className="font-semibold">• Digital Personal Data Protection Act, 2023 (India)</span>
                <br />
                <span className="font-semibold">• Information Technology Act, 2000</span>
                <br />
                <span className="font-semibold">
                  • Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or
                  Information) Rules, 2011 (where applicable)
                </span>
              </p>
            </section>

            {/* What is health data */}
            <section
              ref={(el) => {
                sectionRefs.current['what-is-health-data'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">What is considered health data?</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                “Health data” may include, but is not limited to:
              </p>
              <p className="text-gray-700 leading-relaxed">
                • Medical history and symptoms
                <br />• Diagnostic reports, lab results, and medical documents
                <br />• Uploaded images and files related to health
                <br />• Appointment details and prescriptions
                <br />• (If available) user interactions that include health information, such as messages or notes
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                We treat such information as sensitive and apply enhanced protection measures.
              </p>
            </section>

            {/* Lawful basis */}
            <section
              ref={(el) => {
                sectionRefs.current['lawful-basis'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Lawful basis and user consent</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We process health data when you voluntarily provide it through the platform and when processing is
                necessary to provide the services you request (for example, storing and displaying your medical records).
              </p>
              <p className="text-gray-700 leading-relaxed">
                Where consent is required, you may withdraw consent at any time. Withdrawing consent may limit or prevent
                your ability to use certain features of the platform. We may retain certain information if required by
                law or for legitimate purposes such as security, fraud prevention, or dispute resolution.
              </p>

              <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-5 text-gray-700">
                <p className="font-semibold text-black mb-2">Care Circle / Family Profiles</p>
                <p className="leading-relaxed">
                  If you add or manage health data for a family member or another person, you confirm that you have their
                  valid consent or lawful authority to do so. You are responsible for ensuring that any data you upload
                  or manage for others is accurate and shared lawfully.
                </p>
              </div>
            </section>

            {/* Purpose */}
            <section
              ref={(el) => {
                sectionRefs.current['purpose'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Purpose of processing health data</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We process health data for legitimate, clearly defined purposes, including:
              </p>
              <p className="text-gray-700 leading-relaxed">
                • Providing features to store, organize, and retrieve health records
                <br />• Generating summaries or insights from user-uploaded documents (where such features are enabled)
                <br />• Supporting user requests and troubleshooting
                <br />• Improving platform reliability, security, and user experience
                <br />• Preventing misuse, fraud, and unauthorized access
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                We do not use health data for advertising or marketing purposes.
              </p>
            </section>

            {/* Minimization */}
            <section
              ref={(el) => {
                sectionRefs.current['data-minimization'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Data minimization and access control</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We follow data minimization and least-privilege principles:
              </p>
              <p className="text-gray-700 leading-relaxed">
                • We collect only the data needed to provide the service
                <br />• Access to health data is restricted to authorized systems and processes
                <br />• Internal access is limited, logged, and reviewed where appropriate
                <br />• Health data is not accessed unless required for functionality, support, or security
              </p>
            </section>

            {/* Security measures */}
            <section
              ref={(el) => {
                sectionRefs.current['data-security-measures'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Data security measures</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                {LEGAL.appName} implements reasonable technical and organizational safeguards, which may include:
              </p>
              <p className="text-gray-700 leading-relaxed">
                • Secure authentication and authorization controls
                <br />• Encryption in transit (for example, HTTPS/TLS) and encryption at rest where applicable
                <br />• Protected infrastructure, secure storage, and network controls
                <br />• Monitoring and logging of access and system events
                <br />• Regular review of security practices and access permissions
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                No system can guarantee absolute security. However, we continuously work to protect data against
                unauthorized access, loss, misuse, or disclosure.
              </p>
            </section>

            {/* Sharing */}
            <section
              ref={(el) => {
                sectionRefs.current['data-sharing'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Data sharing and third-party processing</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We do not sell health data.
              </p>
              <p className="text-gray-700 leading-relaxed">
                Health data may be shared only:
                <br />• With trusted service providers that help us operate the platform (for example, secure hosting,
                database, storage, email delivery, error monitoring, or analytics if enabled)
                <br />• When required to comply with law, legal process, or a lawful request by public authorities
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                We require our service providers to follow confidentiality and appropriate security obligations
                consistent with this page and our Privacy Policy.
              </p>

              <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-5 text-gray-700">
                <p className="font-semibold text-black mb-2">Cross-border processing</p>
                <p className="leading-relaxed">
                  Depending on the infrastructure we use, your data may be processed or stored in locations outside India.
                  When we do so, we take steps intended to ensure an appropriate level of protection consistent with
                  applicable law and our contractual safeguards with service providers.
                </p>
              </div>
            </section>

            {/* Retention */}
            <section
              ref={(el) => {
                sectionRefs.current['retention'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Retention and deletion</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We retain health data for as long as your account is active or as needed to provide the services you
                request. You may request deletion of your account and associated data.
              </p>
              <p className="text-gray-700 leading-relaxed">
                After deletion, we may retain limited information where required by law or for legitimate purposes such
                as security, fraud prevention, backups, or resolving disputes. Backup copies, if any, may persist for a
                limited period based on our backup and retention cycles.
              </p>
            </section>

            {/* Rights */}
            <section
              ref={(el) => {
                sectionRefs.current['your-rights-health-data'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Your rights regarding health data</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Subject to applicable laws, you may have the right to:
              </p>
              <p className="text-gray-700 leading-relaxed">
                • Access your personal data and health data
                <br />• Correct inaccurate or incomplete information
                <br />• Request deletion of your personal data
                <br />• Withdraw consent where applicable
                <br />• Request information about how your data is used
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                Requests can be made through the platform (if supported) or by contacting us at{' '}
                <a href={`mailto:${LEGAL.contactEmail}`} className="text-blue-600 hover:underline">
                  {LEGAL.contactEmail}
                </a>
                . You may also contact our grievance email at{' '}
                <a href={`mailto:${LEGAL.grievanceEmail}`} className="text-blue-600 hover:underline">
                  {LEGAL.grievanceEmail}
                </a>
                .
              </p>
            </section>

            {/* AI */}
            <section
              ref={(el) => {
                sectionRefs.current['ai-specific-considerations'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">AI-specific considerations</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Some features of {LEGAL.appName} may use automated systems to summarize or extract information from
                user-provided documents. Outputs are informational and may be incomplete or inaccurate.
              </p>
              <p className="text-gray-700 leading-relaxed">
                {LEGAL.appName} does not provide medical diagnosis or treatment. Do not rely on AI-generated outputs for
                medical decisions. Always consult a qualified healthcare professional.
              </p>
            </section>

            {/* Updates */}
            <section
              ref={(el) => {
                sectionRefs.current['updates'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Updates to this page</h2>
              <p className="text-gray-700 leading-relaxed">
                We may update this Health Data Privacy & Security page from time to time to reflect changes in law,
                technology, or our practices. Updates will be posted here with a revised “Last Updated” date.
              </p>
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
            {/* BRAND */}
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

export default HealthDataPrivacyLayout;
