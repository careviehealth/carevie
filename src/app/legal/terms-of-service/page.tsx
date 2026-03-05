'use client';

import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';

/**
 * Centralized legal/contact configuration.
 * Update these values once and they will reflect across this page.
 */
const LEGAL = {
  appName: 'G1',
  companyLegalName: 'G1 Technologies Private Limited', // <-- replace with your legal entity name
  contactEmail: 'hello@g1.com', // <-- replace
  grievanceEmail: 'hello@g1.com', // <-- replace (can be same)
  phone: '09511701519', // <-- replace if needed
  address:
    '327, 3rd Floor, Ajmera Sikova, ICRC, Ghatkopar West, Mumbai 400086', // <-- replace if needed
  governingLaw: 'India',
  jurisdiction: 'Mumbai, Maharashtra',
  effectiveDate: '2026-02-26',
  lastUpdated: '2026-02-26',
};

const TermsAndConditions = () => {
  const [menu, setMenu] = useState(false);

  const nav = (id: string) => {
    setMenu(false);
    if (id === 'login') return (window.location.href = '/auth/login');
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

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

      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-8 py-12">
          {/* Header */}
          <div className="mb-10">
            <p className="text-sm text-gray-600 mb-4">
              Effective Date: {LEGAL.effectiveDate} · Last Updated: {LEGAL.lastUpdated}
            </p>
            <h1 className="text-6xl font-serif text-black mb-4">
              {LEGAL.appName} Terms of Service
            </h1>
            <p className="text-gray-700 leading-relaxed">
              These Terms of Service (“Terms”) govern your access to and use of {LEGAL.appName}’s website, apps,
              and services (collectively, the “Services”). These Terms form a legally binding agreement between you
              and {LEGAL.companyLegalName} (“{LEGAL.appName}”, “we”, “us”, “our”).
            </p>
          </div>

          {/* Main Content */}
          <div className="space-y-8">
            {/* 1. Acceptance */}
            <section>
              <h2 className="text-2xl font-bold text-black mb-4">1. Acceptance of these Terms</h2>
              <p className="text-gray-800 leading-relaxed">
                By accessing or using the Services, you confirm that you have read, understood, and agree to be bound
                by these Terms and our{' '}
                <Link href="/legal/privacy-policy" className="text-blue-600 hover:underline">
                  Privacy Policy
                </Link>{' '}
                and{' '}
                <Link href="/legal/cookie-policy" className="text-blue-600 hover:underline">
                  Cookie Policy
                </Link>
                . If you do not agree, do not use the Services.
              </p>
            </section>

            {/* 2. Eligibility */}
            <section>
              <h2 className="text-2xl font-bold text-black mb-4">2. Eligibility</h2>
              <p className="text-gray-800 leading-relaxed">
                The Services are intended for users who are at least 18 years old. By using the Services, you represent
                that you are 18+ and have the legal capacity to enter into a binding contract.
              </p>
            </section>

            {/* 3. What G1 is */}
            <section>
              <h2 className="text-2xl font-bold text-black mb-4">3. What the Services do (and do not do)</h2>
              <p className="text-gray-800 leading-relaxed">
                {LEGAL.appName} is a platform that helps you store, organize, and access health-related information
                such as lab reports, prescriptions, appointment details, bills, and similar records. Some features may
                generate summaries or extracted information from content you upload.
              </p>
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-5 text-gray-800">
                <p className="font-semibold text-black mb-2">Medical disclaimer</p>
                <p className="leading-relaxed">
                  {LEGAL.appName} is not a healthcare provider and does not provide medical advice, diagnosis, or
                  treatment. The Services are for informational and organizational purposes only. Always consult a
                  qualified healthcare professional for medical decisions. If you believe you have a medical emergency,
                  contact emergency services immediately.
                </p>
              </div>
            </section>

            {/* 4. Account */}
            <section>
              <h2 className="text-2xl font-bold text-black mb-4">4. Your account</h2>
              <p className="text-gray-800 leading-relaxed">
                To access certain features, you must create an account and provide accurate information. You are
                responsible for maintaining the confidentiality of your login credentials and for all activity that
                occurs under your account. Notify us immediately if you suspect unauthorized access.
              </p>
            </section>

            {/* 5. Care Circle */}
            <section>
              <h2 className="text-2xl font-bold text-black mb-4">5. Care Circle / managing data for others</h2>
              <p className="text-gray-800 leading-relaxed">
                If you add, upload, or manage health data for a family member or another person, you represent and
                warrant that you have their valid consent or lawful authority to do so. You are responsible for ensuring
                that any such data is uploaded and shared lawfully and accurately.
              </p>
            </section>

            {/* 6. User content */}
            <section>
              <h2 className="text-2xl font-bold text-black mb-4">6. Your content</h2>
              <p className="text-gray-800 leading-relaxed">
                “Your Content” includes any information, files, documents, images, text, or other material you upload,
                enter, store, or submit through the Services (including health-related information).
              </p>
              <p className="text-gray-800 leading-relaxed mt-3">
                You retain ownership of Your Content. You grant {LEGAL.appName} a limited, worldwide, non-exclusive,
                royalty-free license to host, store, process, transmit, and display Your Content solely to provide,
                maintain, secure, and improve the Services (including generating summaries or extracted information from
                Your Content if you use those features).
              </p>
              <p className="text-gray-800 leading-relaxed mt-3">
                You are responsible for Your Content and for ensuring that it does not violate any law or third-party
                rights.
              </p>
              <p className="text-gray-800 leading-relaxed mt-3">
                Backups: While we take reasonable measures to protect and store Your Content, you should keep your own
                backups of important records. The Services are not a guaranteed archival system.
              </p>
            </section>

            {/* 7. Acceptable use */}
            <section>
              <h2 className="text-2xl font-bold text-black mb-4">7. Acceptable use</h2>
              <p className="text-gray-800 leading-relaxed mb-3">
                You agree not to misuse the Services. For example, you must not:
              </p>
              <p className="text-gray-800 leading-relaxed">
                • Break any applicable law or regulation
                <br />• Upload malware, viruses, or harmful code
                <br />• Attempt to gain unauthorized access to accounts, data, or systems
                <br />• Reverse engineer, decompile, or attempt to extract source code (except as permitted by law)
                <br />• Use the Services to build or operate a competing product using our proprietary features
                <br />• Abuse, harass, or threaten others
              </p>
            </section>

            {/* 8. IP */}
            <section>
              <h2 className="text-2xl font-bold text-black mb-4">8. Intellectual property</h2>
              <p className="text-gray-800 leading-relaxed">
                The Services, including all software, designs, branding, text, graphics, and trademarks, are owned by
                {LEGAL.appName} or its licensors and are protected by applicable laws. Except for the limited right to
                use the Services under these Terms, no rights are granted to you.
              </p>
            </section>

            {/* 9. Third-party services */}
            <section>
              <h2 className="text-2xl font-bold text-black mb-4">9. Third-party services and links</h2>
              <p className="text-gray-800 leading-relaxed">
                The Services may contain links to third-party websites or services. We do not control and are not
                responsible for third-party content, policies, or practices. Your use of third-party services is at your
                own risk.
              </p>
            </section>

            {/* 10. Changes */}
            <section>
              <h2 className="text-2xl font-bold text-black mb-4">10. Changes to the Services or Terms</h2>
              <p className="text-gray-800 leading-relaxed">
                We may update or modify the Services and these Terms from time to time. If we make material changes, we
                may provide notice via the Services or by other reasonable means. Continued use of the Services after
                updates means you accept the updated Terms.
              </p>
            </section>

            {/* 11. Termination */}
            <section>
              <h2 className="text-2xl font-bold text-black mb-4">11. Suspension and termination</h2>
              <p className="text-gray-800 leading-relaxed">
                You may stop using the Services at any time. We may suspend or terminate your access if you violate these
                Terms, misuse the Services, or if required for security or legal reasons. Upon termination, your right to
                use the Services stops immediately. Data handling after termination is described in our Privacy Policy,
                including retention and deletion practices.
              </p>
            </section>

            {/* 12. Disclaimers */}
            <section>
              <h2 className="text-2xl font-bold text-black mb-4">12. Disclaimers</h2>
              <p className="text-gray-800 leading-relaxed">
                The Services are provided on an “as is” and “as available” basis. We do not guarantee that the Services
                will be uninterrupted, error-free, or completely secure. Outputs generated by automated systems may be
                inaccurate or incomplete. Use the Services at your own risk.
              </p>
            </section>

            {/* 13. Limitation of liability */}
            <section>
              <h2 className="text-2xl font-bold text-black mb-4">13. Limitation of liability</h2>
              <p className="text-gray-800 leading-relaxed">
                To the maximum extent permitted by applicable law, {LEGAL.appName} will not be liable for any indirect,
                incidental, special, consequential, or punitive damages, or any loss of profits, data, use, goodwill, or
                other intangible losses arising from or related to your use of the Services.
              </p>
              <p className="text-gray-800 leading-relaxed mt-3">
                Nothing in these Terms excludes or limits liability that cannot be excluded under applicable law (for
                example, liability for fraud).
              </p>
            </section>

            {/* 14. Indemnity */}
            <section>
              <h2 className="text-2xl font-bold text-black mb-4">14. Indemnity</h2>
              <p className="text-gray-800 leading-relaxed">
                You agree to indemnify and hold harmless {LEGAL.appName} and its directors, officers, employees, and
                affiliates from any claims, damages, liabilities, and expenses (including reasonable legal fees) arising
                out of or related to your misuse of the Services, your violation of these Terms, or your violation of any
                law or third-party rights.
              </p>
            </section>

            {/* 15. Governing law */}
            <section>
              <h2 className="text-2xl font-bold text-black mb-4">15. Governing law and jurisdiction</h2>
              <p className="text-gray-800 leading-relaxed">
                These Terms are governed by the laws of {LEGAL.governingLaw}. Courts located in {LEGAL.jurisdiction} will
                have exclusive jurisdiction, subject to applicable law.
              </p>
            </section>

            {/* 16. Contact */}
            <section id="footer">
              <h2 className="text-2xl font-bold text-black mb-4">16. Contact</h2>
              <p className="text-gray-800 leading-relaxed">
                For questions about these Terms, contact us at{' '}
                <a href={`mailto:${LEGAL.contactEmail}`} className="text-blue-600 hover:underline">
                  {LEGAL.contactEmail}
                </a>
                . For grievances, email{' '}
                <a href={`mailto:${LEGAL.grievanceEmail}`} className="text-blue-600 hover:underline">
                  {LEGAL.grievanceEmail}
                </a>
                .
              </p>
            </section>

            {/* Copyright */}
            <section>
              <h2 className="text-2xl font-bold text-black mb-4">Copyright and trademark notice</h2>
              <p className="text-gray-800 leading-relaxed">
                © {new Date().getFullYear()} {LEGAL.appName}. All rights reserved. All trademarks, logos, and service
                marks displayed through the Services are the property of {LEGAL.appName} or their respective owners.
              </p>
            </section>
          </div>

          <div className="h-20" />
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
                {LEGAL.companyLegalName}
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
                <p>Phone: {LEGAL.phone}</p>
                <p>Address: {LEGAL.address}</p>
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
                  <p>Phone: {LEGAL.phone}</p>
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

export default TermsAndConditions;
