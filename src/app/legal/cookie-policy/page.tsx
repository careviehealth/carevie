'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';

const CookieTypesTable = () => {
  const cookieTypes = [
    {
      type: "Essential cookies",
      purpose: "These cookies are necessary for the platform to function correctly and cannot be disabled. They are used to enable user authentication and login sessions, maintain security and prevent unauthorized access, and support core features such as form submissions and navigation. Without these cookies, the platform may not work as intended."
    },
    {
      type: "Functional cookies",
      purpose: "These cookies enhance usability and remember user preferences. They help us remember user settings and preferences, improve user experience across sessions, and provide consistent functionality."
    },
    {
      type: "Analytics and performance cookies",
      purpose: "We may use limited analytics tools to understand how users interact with our platform. These cookies help us monitor platform performance, identify errors or usability issues, and improve features and system reliability. All analytics data is collected in an aggregated and anonymized manner where possible."
    },
    {
      type: "Third-party cookies",
      purpose: "In some cases, cookies may be set by trusted third-party service providers that support platform functionality, such as infrastructure and hosting providers, and analytics or performance monitoring services. We do not allow third-party cookies for advertising or marketing purposes."
    }
  ];

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse">
        {/* Table Header */}
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

        {/* Table Body */}
        <tbody>
          {cookieTypes.map((cookie, index) => (
            <tr 
              key={index}
              className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}
            >
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
    { id: 'intro', title: 'Introductory Text' },
    { id: 'what-are-cookies', title: 'What are cookies?' },
    { id: 'Type-of-cookies-we-use', title: 'Types of cookies we use' },
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
              Last updated: 20 Januaray 2026
            </p>
            <h1 className="text-5xl font-serif text-black mb-8">G1 Cookie Policy</h1>
          </div>

          {/* Introductory Text*/}
          <section
            ref={(el) => {
              sectionRefs.current['intro'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black">Introduction</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We use cookies to understand how you use the G1 platform and website. This policy explains what they are, how we use them, and how you can switch them off if you want.
              Just like our Privacy Policy, if there are things you don't understand, our Information Security Team are always happy to chat, so please send us an email at example@gmail.com 
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
            Cookies are small text files which get stored on your computer or mobile phone which act as a 'memo' on the website – they store your settings, so that our website recognises you when you come back. This way, it behaves like something you've been to before (for example, it will fill in your previously inputted preferences).
            Cookies can store lots of different types of information, but don't worry, they can only store information you've shared with us (through a form, for instance). We may use both session cookies (which expire once you close your web browser) and persistent cookies (which stay on your computer or mobile device until you delete them) to provide you with a more personal and interactive experience on our Site.
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
            <p className="text-gray-700 leading-relaxed mb-6">
              G1 uses the following categories of cookies:
            </p>
            <CookieTypesTable />
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
              <br />• Ensure the platform operates securely
              <br />• Maintain login sessions
              <br />• Improve reliability and performance
              <br />• Understand how users interact with our services
              <br /><br />
              We do not use cookies to sell personal data or track users across unrelated websites.
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
            <p className="text-gray-700 leading-relaxed">
             You can control or delete cookies through your browser settings at any time. Most browsers allow you to: View stored cookies, Block cookies, Delete existing cookies. Please note that disabling certain cookies may impact the functionality of the G1 platform.
            </p>
          </section>

         

          {/* Disabling cookies */}
          <section
            ref={(el) => {
              sectionRefs.current['Disabling-cookies'] = el;
            }}
            className="mb-12 scroll-mt-20"
          >
            <h2 className="text-3xl font-serif mb-6 text-black"> Disabling cookies</h2>
            <p className="text-gray-700 leading-relaxed">
             You can typically remove or reject cookies via your browser settings. In order to do this, follow the instructions provided by your browser (usually located within the "settings", "help" "tools" or "edit" facility).  Many browsers are set to accept cookies until you change your settings.
If you do not accept our cookies, you may experience some inconvenience in your use of our Site. For example, we may not be able to recognise your computer or mobile device and you may need to log in every time you visit our Site.
Further information about cookies, including how to see what cookies have been set on your computer or mobile device and how to manage and delete them, visit <a href="https://www.allaboutcookies.org" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">www.allaboutcookies.org</a> and <a href="https://www.youronlinechoices.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">www.youronlinechoices.com</a>.
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
              We may update this Cookie Policy from time to time to reflect changes in technology, legal requirements, or our services. Any updates will be posted on this page with a revised "Last updated" date.
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

export default CookiePolicyLayout;



