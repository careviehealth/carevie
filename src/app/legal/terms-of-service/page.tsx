'use client';

import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';

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
      <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-8 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-6xl font-serif text-black mb-8">Terms and Conditions</h1>
        </div>

        {/* Main Content */}
        <div className="space-y-8">
          {/* First Section */}
          <section>
            <p className="text-gray-800 leading-relaxed">
              These terms of use ("
              <span className="font-semibold">Terms</span>") govern your use of the websites, subdomains, products, and services G1 Ltd or it's affiliates ("
              <span className="font-semibold">G1</span>","
              <span className="font-semibold">us</span>", "
              <span className="font-semibold">our</span>", and "
              <span className="font-semibold">we</span>"), including, without limitation, your use of www.G1.com, any other G1 websites, and any mobile applications made available to you by G1 (collectively, the "
              <span className="font-semibold">Services</span>"). G1 owns all right, title and interest in and to our Services, including all intellectual property rights, and any suggestions, ideas or other feedback provided by you to us relating to our Services. We will solely and exclusively own any copy, modification, revision, enhancement, adaptation, translation, or derivative work of or created from our Services. As between you and us, we own any and all patent rights, copyrights, trade secret rights, trademark rights, and all other proprietary rights relating to our Services. Except for that information which is in the public domain, meaning such information exists in a location other than on our website behind registration, you may not copy, modify, publish, transmit, distribute, or sell any of our proprietary information without express written permission. Certain features of the Services may be subject to additional guidelines, terms, or rules, which may be additionally shared when engaging with such features. All such additional terms, guidelines, and rules, including our Privacy Policy (as defined below), are incorporated by reference into these terms of use (together, these "
              <span className="font-semibold">Terms</span>").
            </p>
          </section>

          {/* Second Section - What do these Terms cover? */}
          <section>
            <h2 className="text-2xl font-bold text-black mb-4">What do these Terms cover?</h2>
            <p className="text-gray-800 leading-relaxed">
              These Terms are the terms and conditions that govern your access to, and use of, the Services. Coaching and Therapy services are not intended for users who are below the age of 18. All other Services are not intended for children below 16 and you should not use or access the Services (and/or accept these Terms) if you are below 16.
            </p>
          </section>
    

        {/* Third Section - Why should you read these Terms? */}
          <section>
            <h2 className="text-2xl font-bold text-black mb-4">Why should you read these Terms?</h2>
            <p className="text-gray-800 leading-relaxed">
              These Terms form a legally binding agreement between you and G1. By accessing or using the Services, you confirm that:

You have read and understood these Terms

You agree to be bound by them

You have the legal capacity to enter into this agreement

You should review these Terms carefully, particularly the sections relating to:

Accounts and user responsibilities

Medical disclaimers and limitations

Liability and termination
            </p>
          </section>


         {/* Fourth Section - What if you do not agree to these Terms? */}
          <section>
            <h2 className="text-2xl font-bold text-black mb-4">What if you do not agree to these Terms?</h2>
            <p className="text-gray-800 leading-relaxed">
              If you do not agree with any part of these Terms, you must not access or use the Services.
            </p>
          </section>


          {/* 1. Information about G1 and contact details */}
          <section>
            <h2 className="text-2xl font-bold text-black mb-4">1. Information about G1 and contact details</h2>
            <p className="text-gray-800 leading-relaxed">
<span className="font-semibold">•Who we are:</span>
G1 is a digital health technology platform providing AI-powered health insights and informational tools.

<br /><span className="font-semibold">•How to contact us:</span>
You may contact us at:
📧 support@G1.com
 (replace when finalised)

<br /><span className="font-semibold">•How we may contact you:</span>
We may contact you using the email address provided during account registration or through in-app notifications.

<br /><span className="font-semibold">•Electronic communications:</span>
You consent to receiving communications from us electronically. Communications sent by email or within the Services satisfy any legal requirement that such communications be in writing.
            <br></br></p>
          </section>


{/* 2. How we deal with your personal information */}
          <section>
            <h2 className="text-2xl font-bold text-black mb-4">2. How we deal with your personal information</h2>
            <p className="text-gray-800 leading-relaxed">
              Your submission of personal information through the Services and our use of cookies are governed by our Privacy Policy and Cookie Policy, which form part of these Terms.
            </p>
          </section>


           {/* 3. Accounts */}
          <section>
            <h2 className="text-2xl font-bold text-black mb-4">3. Accounts</h2>
            <p className="text-gray-800 leading-relaxed">
<span className="font-semibold">•Account creation:</span>
To access certain features of the Services, you must register for an account and provide accurate and complete information.

<br /><span className="font-semibold">•Accuracy of information:</span>
You agree to keep your account information truthful, accurate, and up to date.

<br /><span className="font-semibold">•Account responsibility:</span>
You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account.

<br /><span className="font-semibold">•Unauthorized access:</span>
If you become aware of any unauthorized use of your account, you must notify us immediately.
            
<br /><span className="font-semibold">•Account deletion:</span>
You may request deletion of your account by contacting us. We reserve the right to suspend or terminate accounts as described below.
            
            <br></br></p>
          </section>



{/* 4. Access to the Services */}
          <section>
            <h2 className="text-2xl font-bold text-black mb-4">4. Access to the Services</h2>
            <p className="text-gray-800 leading-relaxed">
<span className="font-semibold">•License:</span>
Subject to these Terms, G1 grants you a limited, non-exclusive, non-transferable, revocable, and non-commercial license to access and use the Services for personal use only.

<br /><span className="font-semibold">•Restrictions:</span>
You agree not to:
Commercially exploit the Services,
Reverse engineer, decompile, or modify any part of the Services,
Use the Services to create a competing product,
Copy or redistribute content except as expressly permitted.
All intellectual property rights not expressly granted remain with G1.

<br /><span className="font-semibold">•Modifications and availability:</span>
We may modify, suspend, or discontinue the Services at any time without liability to you.

            <br></br></p>
          </section>


{/* 5. Nature of the Services (Medical Disclaimer) */}
          <section>
            <h2 className="text-2xl font-bold text-black mb-4">5. Nature of the Services (Medical Disclaimer)</h2>
            <p className="text-gray-800 leading-relaxed">
              G1 provides AI-generated health insights and informational content based on user-provided data.
G1 does not provide medical advice, diagnosis, or treatment. The Services are not a substitute for professional medical care. You should always seek advice from a qualified healthcare professional before making medical decisions.
No doctor-patient relationship is created through your use of the Services.</p>
          </section>    



 {/* 6. User content */}
          <section>
            <h2 className="text-2xl font-bold text-black mb-4">6. User content</h2>
            <p className="text-gray-800 leading-relaxed">
<span className="font-semibold">•User Content:</span> “User Content” means any and all information and content that a user submits to, or uses with, the Services (e.g., content in the user’s profile or postings, any Praise you may send in relation to the Services, any profile image you upload to your Account, or comments you may make when updating your “Check-In” status). You are solely responsible for your User Content. You assume all risks associated with use of your User Content in accordance with these Terms, including any reliance on its accuracy, completeness or usefulness by others, or any disclosure of your User Content that personally identifies you or any third party (for instance, when you send Praise to other users). Please note that “aggregated” and/or “anonymised” data are not “User Content”. We collect, use and share “aggregated” and “anonymised” data as defined and described in our Privacy Policy (detailed above).
<br /><span className="font-semibold">•Confidentiality:</span> G1 takes confidentiality extremely seriously and will keep User Data secure and confidential and shall procure that its personnel (including its officers, directors, staff and employees) shall keep User Data secure and confidential. Neither G1 nor its personnel shall disclose User Data or any element of it to a third party except (1) where you provide express written consent; (2) to the extent that G1 is compelled by law or regulation (in which circumstances G1 will provide prompt notice to you so that you have reasonable opportunity to obtain a protective order or other remedy); (3) in relation to any feedback which you provide to G1 about the operation of its services, in which case the User Data comprising feedback may be disclosed in accordance with the terms of the below section “Do not send us confidential information in Feedback”; and (4) in circumstances where you breach the terms set out below in relation to (i) “Protection of our reputation and third party rights” and (ii) “Protection of our systems”, we may disclose User Data to a third party but only to the extent that such disclosure of User Data is reasonable, proportionate and necessary in the circumstances to enforce our rights and such disclosure shall be strictly limited to the third parties set out below in “How might we enforce these Terms if you violate them?”.
<br /><span className="font-semibold">•Privacy Policy:</span> You should also read these Terms in conjunction with our Privacy Policy (detailed above) which forms part of the Terms.
<br /><span className="font-semibold">•How User Content cannot be used:</span> You confirm and promise to us: that your User Content does not and will not violate our Acceptable Use Policy (as defined below). You may not represent or imply to others that your User Content is in any way provided, sponsored or endorsed by G1. Because you alone are responsible for your User Content, you may expose yourself to liability if, for example, your User Content violates the Acceptable Use Policy.
<br /><span className="font-semibold">•Backing up User Content:</span> G1 is not obligated to backup any User Content, and your User Content may be deleted from the Services at any time without prior notice – accordingly we recommend you store and backup copies elsewhere. You are solely responsible for creating and maintaining your own backup copies of your User Content if you desire.
            <br></br></p>
          </section>


{/* 7. Third-party services and links */}
          <section>
            <h2 className="text-2xl font-bold text-black mb-4">7. Third-party services and links</h2>
            <p className="text-gray-800 leading-relaxed">
              The Services may contain links to third-party websites or services. G1 does not control or endorse these third parties and is not responsible for their content or practices. Your use of third-party services is at your own risk.
              </p>
          </section>   


           {/* 8. Our responsibility for loss or damage */}
          <section>
            <h2 className="text-2xl font-bold text-black mb-4">6. User content</h2>
            <p className="text-gray-800 leading-relaxed">
<span className="font-semibold">•Our Services are not bespoke to you.</span> You acknowledge that the Services provided are not developed to meet your individual requirements, and that it is therefore your responsibility to ensure that the facilities and functions of the Services meet your requirements.
G1<br /><span className="font-semibold">•Any advice or other materials made available through the Services are intended for general information purposes only.</span> We provide information via our Services, such as our G1 Index and Check-In functionalities. The output from these does not constitute medical advice, diagnosis or treatment. They provide information to you based on information entered. They do not diagnose your own health condition or make treatment recommendations for you. They are not intended to be relied upon and are not a substitute for professional medical advice based on your individual condition and circumstances. The advice and other materials we make available are not intended to replace or supplement your healthcare providers’ guidance. You shouldn’t take or stop taking any action (such as taking medicines) based on information from our information services. You should always talk to a qualified medical professional about any questions you may have about a medical condition. If you think you have a medical emergency, you should call your doctor or the emergency services immediately. We make no promises and are not liable about the accuracy, completeness, or suitability for any purpose of the advice, other materials and information published as part of our Services. We make no warranties in relation to the output of our Services. If you contact us through the “Help” section available as part of our Services and correspond with a member of G1’s support department, please be aware that, unless they tell you otherwise, the people responding to your request for help are not doctors or professional medical advisors.
<br /><span className="font-semibold">•We are responsible to you only for foreseeable loss and damage caused by us.</span> If we fail to comply with these Terms, we are responsible for loss or damage you suffer that is a foreseeable result of our breaking these Terms or our failing to use reasonable care and skill, but we are not responsible for any loss or damage that is not foreseeable. Loss or damage is foreseeable if either it is obvious that it will happen or if, at the time these Terms are entered into both we and you knew it might happen.
<br /><span className="font-semibold">•We are not liable for business losses.</span> As noted above, we only make our Services available for your domestic and private use. If you use the Services for any commercial, business or re-sale purpose we will have no liability to you for any loss of profit, loss of business, business interruption, or loss of business opportunity.
<br /><span className="font-semibold">•No liability for User Content.</span> We do not control User Content, you acknowledge and agree that we are not responsible for any User Content, and in particular the content of any Praise, whether provided by you or by others. We make no guarantees regarding the accuracy, currency, suitability, or quality of any User Content.
<br /><span className="font-semibold">•No liability for user interactions.</span> Your interactions with other users of the Services (for instance, through the use of Praise) are solely between you and such users. We do not control your interactions with other Users, you agree that G1 will not be responsible for any loss or damage incurred as the result of any such interactions.
<br /><span className="font-semibold">•No liability for damage caused by unauthorised access.</span> We will not be responsible for any loss or damage incurred as a result of unauthorised access to your Account which is not within our reasonable control,
<br></br></p>
          </section>



          {/* 9. Term and termination    */}
          <section>
            <h2 className="text-2xl font-bold text-black mb-4">9. Term and termination</h2>
            <p className="text-gray-800 leading-relaxed">
              These Terms remain in effect while you use the Services.
We may suspend or terminate your access at any time if you violate these Terms or misuse the Services. Upon termination, your right to access the Services will cease immediately, and associated data may be deleted.
Certain provisions will survive termination, including those relating to intellectual property, liability, and governing law.
          </p>
          </section> 



          {/* 10. Other important terms */}
          <section>
            <h2 className="text-2xl font-bold text-black mb-4">10. Other important terms</h2>
            <p className="text-gray-800 leading-relaxed">
•These Terms constitute the entire agreement between you and G1
<br />•If any provision is found unenforceable, the remaining provisions remain in effect
<br />•We may transfer our rights and obligations under these Terms
<br />•Our failure to enforce any provision does not waive our right to enforce it later</p>
          </section> 



          {/* Copyright and trademark notice */}
          <section>
            <h2 className="text-2xl font-bold text-black mb-4">Copyright and trademark notice</h2>
            <p className="text-gray-800 leading-relaxed">
              © 2026 G1. All rights reserved.
All trademarks, logos, and service marks displayed through the Services are the property of G1 or their respective owners.
</p>
          </section> 



        </div>

        <div className="h-20" />
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


export default TermsAndConditions;
