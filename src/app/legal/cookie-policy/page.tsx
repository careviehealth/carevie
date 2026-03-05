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

const CookieTypesTable = () => {
  const cookieTypes = [
    {
      type: 'Essential cookies (Strictly Necessary)',
      purpose:
        'These cookies are necessary for the platform to function correctly and cannot be switched off in our systems. They are used to enable user authentication and login sessions, maintain security and prevent unauthorized access, and support core features such as form submissions and navigation. Without these cookies, the platform may not work as intended.',
    },
    {
      type: 'Functional cookies',
      purpose:
        'These cookies enhance usability and remember user preferences. They help us remember user settings and preferences, improve user experience across sessions, and provide consistent functionality.',
    },
    {
      type: 'Analytics & performance cookies (Optional)',
      purpose:
        'If enabled, we may use limited analytics and performance tools to understand how users interact with our platform and to improve reliability. These cookies help us monitor performance, identify errors or usability issues, and improve features and system stability. Where feasible, analytics data is collected in aggregated form.',
    },
    {
      type: 'Third-party cookies (Service Providers)',
      purpose:
        'In some cases, cookies may be set by trusted third-party service providers that support platform functionality (for example, hosting, security, or performance monitoring). We do not allow third-party cookies for advertising or cross-site behavioral profiling.',
    },
  ];

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-black">
            <th className="border border-gray-300 px-6 py-4 text-left text-white font-semibold w-1/4">
              Type of Cookie
            </th>
            <th className="border border-gray-300 px-6 py-4 text-left text-white font-semibold w-3/4">
              Purpose
            </th>
          </tr>
        </thead>

        <tbody>
          {cookieTypes.map((cookie, index) => (
            <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="border border-gray-300 px-6 py-4 text-gray-900 font-semibold align-top">
                {cookie.type}
              </td>
              <td className="border border-gray-300 px-6 py-4 text-gray-700 leading-relaxed">
                {cookie.purpose}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const CookieDurationTable = () => {
  const rows = [
    {
      name: 'Session cookies',
      purpose: 'Help the site function during a browsing session (e.g., authentication session continuity).',
      duration: 'Until you close your browser (varies by browser).',
    },
    {
      name: 'Persistent cookies',
      purpose:
        'Remember preferences and support security controls across visits. May also support optional analytics/performance features if enabled.',
      duration:
        'Remains until expiry or deletion; duration varies by purpose (e.g., days/months). We aim to keep persistent durations limited to what is necessary.',
    },
  ];

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-black">
            <th className="border border-gray-300 px-6 py-4 text-left text-white font-semibold w-1/3">
              Cookie Duration
            </th>
            <th className="border border-gray-300 px-6 py-4 text-left text-white font-semibold w-1/3">
              Purpose
            </th>
            <th className="border border-gray-300 px-6 py-4 text-left text-white font-semibold w-1/3">
              How long it lasts
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="border border-gray-300 px-6 py-4 text-gray-900 font-semibold align-top">
                {r.name}
              </td>
              <td className="border border-gray-300 px-6 py-4 text-gray-700 leading-relaxed">
                {r.purpose}
              </td>
              <td className="border border-gray-300 px-6 py-4 text-gray-700 leading-relaxed">
                {r.duration}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const CookiePolicyLayout = () => {
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
    { id: 'what-are-cookies', title: 'What are cookies?' },
    { id: 'Type-of-cookies-we-use', title: 'Types of cookies we use' },
    { id: 'cookie-retention', title: 'Cookie duration & retention' },
    { id: 'How-we-use-cookies', title: 'How we use cookies' },
    { id: 'Your-choices-and-control', title: 'Your choices and control' },
    { id: 'Disabling-cookies', title: 'Disabling cookies' },
    { id: 'Updates-to-this-Cookie-Policy', title: 'Updates to this Cookie Policy' },
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
        if (!element) return;
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

      <div className="flex bg-white">
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
              <h1 className="text-5xl font-serif text-black mb-4">{LEGAL.appName} Cookie Policy</h1>
              <p className="text-gray-700 leading-relaxed">
                This Cookie Policy explains how {LEGAL.companyLegalName} (“{LEGAL.appName}”, “we”, “our”, “us”) uses
                cookies and similar technologies on our website and platform. For more information about how we handle
                personal data, please read our{' '}
                <Link href="/legal/privacy-policy" className="text-blue-600 hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>

            {/* Introductory Text */}
            <section
              ref={(el) => {
                sectionRefs.current['intro'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Introduction</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Cookies help us keep {LEGAL.appName} secure, remember preferences, and (if enabled) understand usage
                patterns so we can improve reliability and user experience. Some cookies are strictly necessary to make
                the platform work.
              </p>
              <p className="text-gray-700 leading-relaxed">
                If you have questions about this Cookie Policy, contact us at{' '}
                <a href={`mailto:${LEGAL.contactEmail}`} className="text-blue-600 hover:underline">
                  {LEGAL.contactEmail}
                </a>
                .
              </p>
            </section>

            {/* What are cookies? */}
            <section
              ref={(el) => {
                sectionRefs.current['what-are-cookies'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">What are cookies?</h2>
              <p className="text-gray-700 leading-relaxed">
                Cookies are small text files stored on your device when you visit a website. They can help the website
                remember you (for example, to keep you logged in, apply your settings, and improve security). We may use
                both session cookies (which typically expire when you close your browser) and persistent cookies (which
                remain until they expire or you delete them).
              </p>
            </section>

            {/* Types of cookies we use */}
            <section
              ref={(el) => {
                sectionRefs.current['Type-of-cookies-we-use'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Types of cookies we use</h2>
              <p className="text-gray-700 leading-relaxed mb-6">{LEGAL.appName} uses the following categories of cookies:</p>
              <CookieTypesTable />

              <div className="mt-6 text-gray-700 leading-relaxed">
                <p className="mb-2">
                  <span className="font-semibold">No advertising cookies:</span> We do not use cookies for behavioral
                  advertising or cross-site profiling.
                </p>
                <p>
                  <span className="font-semibold">Third-party service providers:</span> Some cookies may be set by
                  providers that help us operate the platform (for example, hosting, security, error monitoring, and
                  performance). These providers act as service providers/processors for operational purposes.
                </p>
              </div>
            </section>

            {/* Cookie duration & retention */}
            <section
              ref={(el) => {
                sectionRefs.current['cookie-retention'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Cookie duration & retention</h2>
              <p className="text-gray-700 leading-relaxed mb-6">
                Cookies may be stored for different lengths of time depending on their purpose. We use session and
                persistent cookies as described below.
              </p>
              <CookieDurationTable />
            </section>

            {/* How we use cookies */}
            <section
              ref={(el) => {
                sectionRefs.current['How-we-use-cookies'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">How we use cookies</h2>
              <p className="text-gray-700 leading-relaxed">
                We use cookies to:
                <br />• Keep the platform operating securely
                <br />• Maintain login sessions and authentication
                <br />• Remember preferences and settings
                <br />• Improve reliability and performance
                <br />• (If enabled) understand how users interact with our services to improve usability
                <br />
                <br />
                We do not sell personal data through cookies, and we do not use cookies to track you across unrelated
                websites for advertising.
              </p>
            </section>

            {/* Your choices and control */}
            <section
              ref={(el) => {
                sectionRefs.current['Your-choices-and-control'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Your choices and control</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                You can control or delete cookies through your browser settings at any time. Most browsers allow you to
                view stored cookies, block cookies, and delete existing cookies. Please note that disabling certain
                cookies may impact the functionality of the {LEGAL.appName} platform.
              </p>
              <p className="text-gray-700 leading-relaxed">
                Where we use non-essential cookies (for example, analytics cookies), we will request your consent through
                a cookie banner or preference manager (if enabled on the site). You can change your preferences later
                through the same mechanism or your browser settings.
              </p>
            </section>

            {/* Disabling cookies */}
            <section
              ref={(el) => {
                sectionRefs.current['Disabling-cookies'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Disabling cookies</h2>
              <p className="text-gray-700 leading-relaxed">
                You can typically remove or reject cookies via your browser settings. To do this, follow the instructions
                provided by your browser (usually located within “Settings”, “Help”, “Tools”, or “Edit”). Many browsers
                are set to accept cookies until you change your settings.
                <br />
                <br />
                If you do not accept our cookies, you may experience some inconvenience in your use of our site and
                platform. For example, we may not be able to recognize your device and you may need to log in each time
                you visit.
                <br />
                <br />
                For more information about cookies, including how to see what cookies have been set on your device and
                how to manage and delete them, visit{' '}
                <a
                  href="https://www.allaboutcookies.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  www.allaboutcookies.org
                </a>{' '}
                and{' '}
                <a
                  href="https://www.youronlinechoices.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  www.youronlinechoices.com
                </a>
                .
              </p>
            </section>

            {/* Updates to this Cookie Policy */}
            <section
              ref={(el) => {
                sectionRefs.current['Updates-to-this-Cookie-Policy'] = el;
              }}
              className="mb-12 scroll-mt-20"
            >
              <h2 className="text-3xl font-serif mb-6 text-black">Updates to this Cookie Policy</h2>
              <p className="text-gray-700 leading-relaxed">
                We may update this Cookie Policy from time to time to reflect changes in technology, legal requirements,
                or our services. Any updates will be posted on this page with a revised “Last Updated” date. If changes
                are material, we may provide additional notice where appropriate.
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

export default CookiePolicyLayout;
