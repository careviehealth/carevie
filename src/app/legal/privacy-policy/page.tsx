'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';

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
    { id: 'intro', title: 'Introductory Text' },
    { id: 'who-are-we', title: 'Who are we?' },
    { id: 'types-info', title: 'Types of Information we Collect' },
    { id: 'how-use', title: 'How we use your personal data and why?' },
    { id: 'how-collect', title: 'How we collect your personal data' },
    { id: 'who-share', title: 'Who do we share your personal data with?' },
    { id: 'your-rights', title: 'What are your rights?' },
    { id: 'security', title: 'Data security, integrity, and retention of your personal data' },
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
              Last updated: 20 January 2026
            </p>
            <h1 className="text-5xl font-serif text-black mb-8">G1 Privacy Policy</h1>
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
              This Privacy Policy describes how G1 collects, uses, and shares your personal data when you use our
              website at <a href="https://G1-ssr.vercel.app" className="text-blue-600 hover:underline">https://G1-ssr.vercel.app</a> ("Site"), you use our G1 app and platform, you contact us, you sign up to
              our newsletter, or you otherwise engage us. We know that these aren't always the easiest documents to
              read, so we have tried to make this Policy as short and easy to understand as possible. We make updates to
              this Privacy Policy and will let you know by email when we do, so we encourage you to come back and have
              another look when you receive an update notification from us.
            </p>
          </section>

          {/* Who are we? */}
          <section
            ref={(el) => {
              sectionRefs.current['who-are-we'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">Who are we?</h2>
            <p className="text-gray-700 leading-relaxed">
            G1 is a digital health platform that uses artificial intelligence to help users better understand their health information. Our services allow users to create a secure profile, upload medical reports, receive AI-generated health insights, and interact with an AI assistant for general health-related guidance.
            G1 is designed to support health awareness and decision-making, but it does not replace professional medical advice, diagnosis, or treatment.
            </p>
          </section>

          {/* Types of Information we Collect */}
          <section
            ref={(el) => {
              sectionRefs.current['types-info'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">Types of Information we Collect</h2>
            <p className="text-gray-700 leading-relaxed">
              We may collect the following categories of personal and health-related information:
              Identity Information: Name, email address, age, gender, and profile photo,
              Contact Information: Email address and optional phone number,
              Health Information: Medical history, symptoms, uploaded medical reports, test results, and related documents,
              Usage Data: Interactions with the platform, chatbot conversations, features accessed, and time spent,
              Technical Data: IP address, device type, browser type, operating system, and log data,
              Authentication Data: Login credentials and verification tokens (stored securely)
            </p>
          </section>

          {/* How we use your personal data and why? */}
          <section
            ref={(el) => {
              sectionRefs.current['how-use'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">How we use your personal data and why?</h2>
            <p className="text-gray-700 leading-relaxed">
              We use your personal data for the following purposes:
              To create and manage your G1 account,
              To analyze uploaded medical reports and generate AI-based health insights,
              To personalize user experience and improve platform accuracy,
              To enable chatbot-based health guidance and contextual responses,
              To maintain platform security and prevent unauthorized access,
              To communicate important updates, security alerts, or service notifications,
              To comply with legal, regulatory, and operational requirements.
              We process your data only when there is a valid purpose and legal basis to do so.
            </p>
          </section>

          {/* How we collect your personal data */}
          <section
            ref={(el) => {
              sectionRefs.current['how-collect'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">How we collect your personal data</h2>
            <p className="text-gray-700 leading-relaxed">
              We collect personal data through:
              Information you provide directly during signup, profile creation, and medical forms,
              Medical reports, images, and documents you upload voluntarily,
              Interactions with the AI chatbot and platform features,
              Automated technologies such as cookies and server logs,
              Communication you initiate with us for support or inquiries.
            </p>
          </section>

          {/* Who do we share your personal data with? */}
          <section
            ref={(el) => {
              sectionRefs.current['who-share'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">Who do we share your personal data with?</h2>
            <p className="text-gray-700 leading-relaxed">
              We do not sell or rent your personal data.
              We may share limited data with:
              Trusted third-party service providers (e.g., cloud hosting, AI processing services) strictly for platform functionality,
              Technical infrastructure providers for secure storage and processing,
              Legal or regulatory authorities when required by law.
              All third parties are contractually obligated to maintain confidentiality and data security.
            </p>
          </section>

          {/* What are your rights? */}
          <section
            ref={(el) => {
              sectionRefs.current['your-rights'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">What are your rights?</h2>
            <p className="text-gray-700 leading-relaxed">
              Depending on your location, you may have the right to:
              Access your personal data,
              Correct or update inaccurate information,
              Request deletion of your personal data,
              Withdraw consent for data processing,
              Restrict or object to certain types of processing,
              Request a copy of your data in a portable format.
              You may exercise these rights by contacting us through the platform or via our support email.
            </p>
          </section>

          {/* Data security, integrity, and retention */}
          <section
            ref={(el) => {
              sectionRefs.current['security'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">Data security, integrity, and retention of your personal data</h2>
            <p className="text-gray-700 leading-relaxed">
              We implement appropriate technical and organizational measures to protect your data, including:
              Secure authentication and access controls,
              Encryption of sensitive data where applicable,
              Restricted internal access to personal and health data.
              We retain personal data only for as long as necessary to fulfill the purposes outlined in this policy or to comply with legal obligations. Data is securely deleted when no longer required.
            </p>
          </section>

          {/* Data transfers, storage and processing */}
          <section
            ref={(el) => {
              sectionRefs.current['transfers'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">Data transfers, storage and processing</h2>
            <p className="text-gray-700 leading-relaxed">
              Your personal data may be stored and processed on secure servers operated by G1 or trusted service providers.
              Data may be transferred across regions solely for operational purposes, and we take reasonable steps to ensure appropriate safeguards are in place to protect your information during such transfers.
            </p>
          </section>

          {/* Cookies and tracking technologies */}
          <section
            ref={(el) => {
              sectionRefs.current['cookies'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">Cookies and tracking technologies</h2>
            <p className="text-gray-700 leading-relaxed">
              G1 uses cookies and similar technologies to:
              Maintain user sessions and authentication,
              Improve platform performance and usability,
              Remember user preferences.
              We use only essential and functional cookies unless otherwise stated. You can control cookie usage through your browser settings, though disabling cookies may affect certain platform features.
              Your can view our Cookies policy here.
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


export default PrivacyPolicyLayout;


