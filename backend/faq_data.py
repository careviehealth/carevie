# backend/faq_data.py

FAQS = [
    {
        "id": "login_mobile",
        "keywords": ["login", "sign in", "mobile login", "how to login"],
        "answer": {
            "en": "To login, enter your registered mobile number and verify with the OTP sent to your phone.",
            "hi": "लॉगिन करने के लिए, अपना पंजीकृत मोबाइल नंबर दर्ज करें और अपने फोन पर भेजे गए OTP से सत्यापित करें।"
        },
        "handoff": False
    },
    {
        "id": "change_mobile",
        "keywords": ["change mobile", "update mobile number", "new mobile"],
        "answer": {
            "en": "To change your mobile number, go to Settings → Profile → Update Mobile Number. You will need to verify the new number with OTP.",
            "hi": "अपना मोबाइल नंबर बदलने के लिए, सेटिंग्स → प्रोफ़ाइल → मोबाइल नंबर अपडेट पर जाएं। आपको नए नंबर को OTP से सत्यापित करना होगा।"
        },
        "handoff": False
    },
    {
        "id": "mobile_security",
        "keywords": ["mobile security", "otp", "verification", "secure login"],
        "answer": {
            "en": "Your mobile number is secured with OTP verification. Keep your mobile number updated and do not share OTPs with anyone.",
            "hi": "आपका मोबाइल नंबर OTP सत्यापन के साथ सुरक्षित है। अपना मोबाइल नंबर अपडेट रखें और किसी के साथ OTP साझा न करें।"
        },
        "handoff": False
    },
    {
        "id": "account_hacked",
        "keywords": ["account hacked", "unauthorized access", "someone logged in"],
        "answer": {
            "en": "This looks serious. I will connect you to our customer support team for immediate help.",
            "hi": "यह गंभीर लगता है। मैं आपको तुरंत मदद के लिए हमारे ग्राहक सहायता दल से जोड़ दूंगा।"
        },
        "handoff": True
    },
    {
        "id": "pricing",
        "keywords": ["pricing", "cost", "subscription", "plans"],
        "answer": {
            "en": "You can find all pricing details on our Pricing page. Would you like me to open it for you?",
            "hi": "आप सभी मूल्य निर्धारण विवरण हमारी मूल्य निर्धारण पृष्ठ पर पा सकते हैं। क्या आप इसे खोलना चाहेंगे?"
        },
        "handoff": False
    },
    {
        "id": "book_appointment",
        "keywords": ["book appointment", "appointment", "schedule appointment", "how to book appointment", "make appointment"],
        "answer": {
            "en": "To book an appointment: 1. Log in to your account. 2. Go to Home/Dashboard. 3. Click on 'Connect to Clinic' section. 4. Click on 'Book Appointment' option. 5. Select doctor/specialist. 6. Choose available date and time. 7. Submit to confirm the appointment.",
            "hi": "अपॉइंटमेंट बुक करने के लिए: 1. अपने अकाउंट में लॉगिन करें। 2. होम/डैशबोर्ड पर जाएँ। 3. 'क्लिनिक से जुड़ें' सेक्शन पर क्लिक करें। 4. 'अपॉइंटमेंट बुक' ऑप्शन पर क्लिक करें। 5. डॉक्टर/स्पेशलिस्ट चुनें। 6. उपलब्ध तिथि और समय चुनें। 7. अपॉइंटमेंट कॉन्फ़र्म करने के लिए सबमिट करें।"
        },
        "handoff": False
    }
]
