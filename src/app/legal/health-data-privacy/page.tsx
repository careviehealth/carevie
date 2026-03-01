'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';

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
    { id: 'intro', title: 'Introductory Text' },
    { id: 'our-commitment', title: 'Our commitment to health data protection' },
    { id: 'what-is-health-data', title: 'What is considered health data?' },
    { id: 'lawful-basis', title: 'Lawful basis and user consent' },
    { id: 'purpose', title: 'Purpose of processing health data' },
    { id: 'data-minimization', title: 'Data minimization and access control' },
    { id: 'data-security-measures', title: 'Data security measures' },
    { id: 'data-sharing', title: 'Data sharing and third-party processing' },
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

        const distance = Math.abs(
          element.getBoundingClientRect().top - contentTop - 100
        );
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
          <p className="font-bold text-[#14b8a6] text-xl">G1</p>
        </div>

        {/* DESKTOP NAV CENTER */}
        <div className="hidden md:flex gap-4 justify-center">


        </div>

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
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto"
      >
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
              Last updated: 20th January 2026
            </p>
            <h1 className="text-5xl font-serif text-black mb-8">G1 Health Data Privacy & Seurity</h1>
          </div>

          {/* Introductory Text Section */}
          <section
            ref={(el) => {
              sectionRefs.current['intro'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">Introductory Text</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              G1 is committed to protecting the privacy, confidentiality, and security of personal and health-related information. This page explains how we handle health data and the safeguards we use to protect it in accordance with applicable Indian data protection laws.
            </p>
          </section>

          {/* Our commitment to health data protection */}
          <section
            ref={(el) => {
              sectionRefs.current['our-commitment'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">Our commitment to health data protection</h2>
            <p className="text-gray-700 leading-relaxed">
           Health-related information is highly sensitive. G1 treats all personal and health data with a high standard of care and processes such data responsibly, transparently, and securely.

We follow applicable Indian laws, including:

<br /><span className="font-semibold">•Digital Personal Data Protection Act, 2023 (India)</span>

<br /><span className="font-semibold">•Information Technology Act, 2000</span>

<br /><span className="font-semibold">•Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011</span>
</p>
          </section>



          {/* What is considered health data? */}
          <section
            ref={(el) => {
              sectionRefs.current['what-is-health-data'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">What is considered health data?</h2>
            <p className="text-gray-700 leading-relaxed">
             Health data may include, but is not limited to:

Medical history and symptoms,

Diagnostic reports, lab results, and medical documents,

Uploaded images and files related to health,

AI chatbot interactions involving health information.

Under Indian law, such data is treated as Sensitive Personal Data and receives enhanced protection.
            </p>
          </section>



          {/* Lawful basis and user consent */}
          <section
            ref={(el) => {
              sectionRefs.current['lawful-basis'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">Lawful basis and user consent</h2>
            <p className="text-gray-700 leading-relaxed">
             We process health data only when:

You voluntarily provide it through the platform,

You have given clear and informed consent,

Processing is necessary to provide the requested services.

You may withdraw your consent at any time, subject to legal and operational requirements.
            </p>
          </section>



          {/* Purpose of processing health data */}
          <section
            ref={(el) => {
              sectionRefs.current['purpose'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">Purpose of processing health data</h2>
            <p className="text-gray-700 leading-relaxed">
              We process health data solely for legitimate and clearly defined purposes, including:

Providing AI-generated health insights and summaries,

Enabling analysis of uploaded medical reports,

Supporting chatbot-based health guidance,

Improving system accuracy and reliability,

Ensuring platform security and preventing misuse.

We do not use health data for advertising or marketing purposes.
            </p>
          </section>



          {/* Data minimization and access control */}
          <section
            ref={(el) => {
              sectionRefs.current['data-minimization'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">Data minimization and access control</h2>
            <p className="text-gray-700 leading-relaxed">
             We follow the principles of data minimization and least privilege:

We collect only data that is necessary for service delivery,

Access to health data is restricted to authorized systems,

Internal access is limited and monitored.

Health data is not accessed unless required for functionality or security
            </p>
          </section>



          {/* Data security measures */}
          <section
            ref={(el) => {
              sectionRefs.current['data-security-measures'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">Data security measures</h2>
            <p className="text-gray-700 leading-relaxed">
              G1 implements reasonable technical and organizational safeguards, including:

Secure authentication and authorization controls,

Encryption of sensitive data where applicable,

Protected cloud infrastructure and secure storage,

Monitoring and logging of system access,

Regular review of security practices.

While no system can guarantee absolute security, we continuously work to protect data against unauthorized access, loss, misuse, or disclosure.
            </p>
          </section>



          {/* Data sharing and third-party processing */}
          <section
            ref={(el) => {
              sectionRefs.current['data-sharing'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">Data sharing and third-party processing</h2>
            <p className="text-gray-700 leading-relaxed">
             We do not sell health data.

Health data may be shared only with:

Trusted service providers supporting secure storage, processing, or AI analysis,

Legal or regulatory authorities when required by law.

All third-party processors are required to follow confidentiality and data protection obligations consistent with this policy.
           </p>
          </section>



          {/* Your rights regarding health data */}
          <section
            ref={(el) => {
              sectionRefs.current['your-rights-health-data'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">Your rights regarding health data</h2>
            <p className="text-gray-700 leading-relaxed">
              Subject to applicable laws, you may have the right to:

Access your health data,

Correct inaccurate or incomplete information

Request deletion of your personal data,

Withdraw consent for data processing,

Request information about how your data is used.

Requests can be made through the platform or by contacting us directly.
</p>
          </section>



          {/* AI-specific considerations */}
          <section
            ref={(el) => {
              sectionRefs.current['ai-specific-considerations'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">AI-specific considerations</h2>
            <p className="text-gray-700 leading-relaxed">
              Health insights generated by G1 are produced using automated systems and user-provided data. AI outputs are informational in nature and may not always be accurate or complete.
G1 does not provide medical diagnosis or treatment. Users should consult qualified healthcare professionals for medical advice.
</p>
          </section>


          {/* Updates to this page */}
          <section
            ref={(el) => {
              sectionRefs.current['updates'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">Updates to this page</h2>
            <p className="text-gray-700 leading-relaxed">
             We may update this Health Data Privacy & Security page from time to time to reflect changes in law, technology, or our practices. Updates will be posted here with a revised date.
             </p>
          </section>

          <div className="h-20" />
        </div>
      </div>
    </div>
    <footer
      id="footer"
      className="bg-gray-900 text-white py-8 md:py-4"
    >
      <div className="max-w-6xl mx-auto px-4">
        {/* DESKTOP FOOTER */}
        <div className="hidden md:grid md:grid-cols-3 gap-8">
          {/* BRAND */}
          <div className="md:col-span-1">
            <div className="flex gap-2 items-center mb-4">
              <div className="w-8 h-8 bg-gradient-to-r from-[#14b8a6] to-[#134E4A] rounded-lg" />
              <p className="font-bold text-[#14b8a6] text-xl">G1</p>
            </div>
            <p className="text-gray-400 text-sm">
              Healthcare, beautifully reimagined. Your health. Your family. Your control.
            </p>
          </div>

          {/* CONTACT US */}
          <div className="md:col-span-1">
            <h3 className="font-semibold text-lg mb-4">Contact Us</h3>
            <div className="space-y-2 text-gray-400 text-sm">
              <p>Email: hello@G1.com</p>
              <p>Phone: 09511701519</p>
              <p>Address: 327, 3rd Floor, Ajmera Sikova, ICRC, Ghatkopar West, Mumbai 400086</p>
            </div>
          </div>

          {/* LEGAL */}
          <div className="md:col-span-1">
            <h3 className="font-semibold text-lg mb-4">Legal</h3>
            <div className="space-y-2 text-gray-400 text-sm">
              <Link href="/legal/privacy-policy" className="block hover:text-white transition">Privacy Policy</Link>
              <Link href="/legal/terms-of-service" className="block hover:text-white transition">Terms of Service</Link>
              <Link href="/legal/cookie-policy" className="block hover:text-white transition">Cookie Policy</Link>
              <Link href="/legal/health-data-privacy" className="block hover:text-white transition">Health Data Privacy</Link>
            </div>
          </div>
        </div>

        {/* MOBILE FOOTER */}
        <div className="md:hidden">
          {/* BRAND */}
          <div className="flex gap-2 items-center">
            <div className="w-6 h-6 bg-gradient-to-r from-[#14b8a6] to-[#134E4A] rounded-lg" />
            <p className="font-bold text-[#14b8a6] text-lg">G1</p>
          </div>

          {/* CONTACT US AND LEGAL SIDE BY SIDE */}
          <div className="flex gap-4">
            {/* CONTACT US */}
            <div className="flex-1">
              <h3 className="font-semibold text-xs mb-1">Contact Us</h3>
              <div className="space-y-0.5 text-gray-400 text-xs">
                <p>Email: hello@G1.com</p>
                <p>Phone: 09511701519</p>
                <p>Address: 327, 3rd Floor, Ajmera Sikova, ICRC, Ghatkopar West, Mumbai 400086</p>
              </div>
            </div>

                {/* LEGAL */}
                <div className="flex-1">
                  <h3 className="font-semibold text-xs mb-1">Legal</h3>
              <div className="space-y-0.5 text-gray-400 text-xs">
                    <Link href="/legal/privacy-policy" className="block hover:text-white transition">Privacy Policy</Link>
                    <Link href="/legal/terms-of-service" className="block hover:text-white transition">Terms of Service</Link>
                    <Link href="/legal/cookie-policy" className="block hover:text-white transition">Cookie Policy</Link>
                    <Link href="/legal/health-data-privacy" className="block hover:text-white transition">Health Data Privacy</Link>
                  </div>
                </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 text-center hidden md:block">
          <p className="text-gray-400 text-sm">© {new Date().getFullYear()} G1. All rights reserved.</p>
        </div>
      </div>
    </footer>
  </div>
);
};


export default HealthDataPrivacyLayout;


