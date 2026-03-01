'use client';

import React, {
  useState,
  useRef,
  useMemo,
  useLayoutEffect,
  useEffect
} from 'react';

import { Menu, X, Lock, AlertCircle, Users, Brain } from 'lucide-react';
import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

function Background() {
  return (
    <div className="absolute inset-0 bg-white overflow-hidden z-0">
      <div className="absolute w-64 h-64 bg-[#134E4A] rounded-full opacity-40 blur-3xl top-10 left-10"></div>
      <div className="absolute w-64 h-64 bg-[#14b8a6] rounded-full opacity-40 blur-3xl top-180 left-0"></div>
      <div className="absolute w-80 h-80 bg-[#14b8a6] rounded-full opacity-40 blur-3xl top-1/4 right-20"></div>
      <div className="absolute w-96 h-96 bg-[#134E4A] rounded-full opacity-40 blur-3xl bottom-20 left-1/3"></div>
      <div className="absolute w-72 h-72 bg-[#14b8a6] rounded-full opacity-40 blur-3xl top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute w-64 h-64 bg-[#134E4A] rounded-full opacity-60 blur-3xl bottom-120 right-10"></div>
      <div className="absolute w-80 h-80 bg-[#14b8a6] rounded-full opacity-40 blur-3xl top-3/4 left-10"></div>
      <div className="absolute w-96 h-96 bg-[#14b8a6] rounded-full opacity-60 blur-3xl top-20 right-1/4"></div>
      <div className="absolute w-72 h-72 bg-[#14b8a6] rounded-full opacity-40 blur-3xl bottom-1/3 right-1/3"></div>
      <div className="absolute w-64 h-64 bg-[#134E4A] rounded-full opacity-40 blur-3xl top-1/3 left-20"></div>
      <div className="absolute w-80 h-80 bg-[#14b8a6] rounded-full opacity-40 blur-3xl bottom-40 left-1/4"></div>
    </div>
  );
}

/* ========================= ScrollFloat ========================= */
const ScrollFloat = ({ children }: { children: React.ReactNode }) => {
  const ref = useRef<HTMLHeadingElement | null>(null);

  const chars = useMemo(() => {
    const text = typeof children === 'string' ? children : '';
    return text.split('').map((c, i) => (
      <span key={i} className="inline-block">
        {c === ' ' ? '\u00A0' : c}
      </span>
    ));
  }, [children]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      const chars = el.querySelectorAll('span');

      gsap.fromTo(
        chars,
        {
          opacity: 0,
          yPercent: 120,
          scaleY: 2,
          scaleX: 0.6
        },
        {
          opacity: 1,
          yPercent: 0,
          scaleY: 1,
          scaleX: 1,
          stagger: 0.05,
          ease: 'back.inOut(2)',
          scrollTrigger: {
            trigger: ref.current,
            start: 'top 85%',
            end: 'bottom 60%',
            scrub: 2
          }
        }
      );
    });

    ScrollTrigger.refresh();
    return () => ctx.revert();
  }, []);

  return (
    <h2
      ref={ref}
      className="text-4xl md:text-6xl font-serif text-black text-center overflow-hidden leading-tight"
    >
      {chars}
    </h2>
  );
};

/* ========================= ScrollReveal With Title Pin + Color Sync ========================= */
interface ScrollRevealProps {
  children: React.ReactNode;
  menuOpen?: boolean;
}

const ScrollReveal: React.FC<ScrollRevealProps> = ({ children, menuOpen = false }) => {
  const ref = useRef<HTMLHeadingElement | null>(null);

  const words = useMemo(
    () =>
      (typeof children === 'string' ? children : '').split(' ').map((w, i) => (
        <span key={i} className="inline-block mr-2 word">
          {w}
        </span>
      )),
    [children]
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      const wordsEl = el.querySelectorAll('.word');

      // reveal animation
      gsap.fromTo(
        wordsEl,
        { opacity: 0.1, filter: 'blur(8px)' },
        {
          opacity: 1,
          filter: 'blur(0px)',
          stagger: 0.08,
          scrollTrigger: {
            trigger: ref.current,
            start: 'top 85%',
            end: 'bottom 60%',
            scrub: 2
          }
        }
      );

      // pin title
      ScrollTrigger.create({
        trigger: '#features',
        start: window.innerWidth >= 768 ? 'top top+=90' : 'top top+=60',
        end: 'bottom top',
        pin: ref.current,
        pinSpacing: false
      });

      // CARD COLOR SYNC: desktop (>= 768px) OR mobile when menu is open
      if (window.innerWidth >= 768 || menuOpen) {
        const cards = document.querySelectorAll('.feature-card');

        ScrollTrigger.create({
          trigger: cards[0],
          start: 'top center',
          end: 'bottom center',
          scrub: true,
          onUpdate: (self) => {
            if (self.isActive) {
              gsap.to(ref.current, { color: '#ffffff', duration: 0.3 });
            } else {
              gsap.to(ref.current, { color: '#000000', duration: 0.3 });
            }
          }
        });

        ScrollTrigger.create({
          trigger: cards[1],
          start: 'top center',
          end: 'bottom center',
          scrub: true,
          onUpdate: (self) => {
            if (self.isActive) {
              gsap.to(ref.current, { color: '#000000', duration: 0.3 });
            } else {
              gsap.to(ref.current, { color: '#ffffff', duration: 0.3 });
            }
          }
        });

        ScrollTrigger.create({
          trigger: cards[2],
          start: 'top center',
          end: 'bottom center',
          scrub: true,
          onUpdate: (self) => {
            if (self.isActive) {
              gsap.to(ref.current, { color: '#ffffff', duration: 0.3 });
            } else {
              gsap.to(ref.current, { color: '#000000', duration: 0.3 });
            }
          }
        });
      } else {
        // Ensure title remains black on mobile/tablet (< 768px) when menu is closed
        gsap.set(ref.current, { color: '#000000' });
      }

    });

    ScrollTrigger.refresh();
    return () => ctx.revert();
  }, []);

  return (
    <h2
      ref={ref}
      className={`text-[clamp(1.8rem,4vw,3rem)] font-serif text-black text-center leading-tight whitespace-nowrap z-50 ${
        menuOpen && window.innerWidth < 768 ? 'hidden' : 'block'
      }`}
    >
      {words}
    </h2>
  );
};


/* ========================= SIMPLE STICKY FEATURE CARD ========================= */
interface FeatureStackCardProps {
  children: React.ReactNode;
  color: string;
  top?: string;
}

const FeatureStackCard: React.FC<FeatureStackCardProps> = ({
  children,
  color,
  top = 'top-[15vh]'
}) => (
  <div
    className={`feature-stack-card w-full h-80 md:h-80 rounded-[32px] shadow-xl flex items-center justify-between px-10 sticky ${top} md:flex-row flex-col`}
    style={{ backgroundColor: color }}
  >
    {children}
  </div>
);


/* ========================= ROTATING CARDS CAROUSEL ========================= */
interface Card {
  id: number;
  image: string;
}

interface RotatingCardsCarouselProps {
  isMobile: boolean;
}

const RotatingCardsCarousel = ({ isMobile }: RotatingCardsCarouselProps) => {
  const cards: Card[] = [
    { id: 1, image: '/images/G1/homepagess.png' },
    { id: 2, image: '/images/G1/vaulpagess.png' },
    { id: 3, image: '/images/G1/profilepagess.png' },
  ];

  const [rotation, setRotation] = useState(0);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  // Rotation effect
  useEffect(() => {
    if (selectedCard !== null) return;

    const interval = setInterval(() => {
      setRotation((prev) => (prev + 1) % 3);
    }, 2000);

    return () => clearInterval(interval);
  }, [selectedCard]);

  const getCardPosition = (index: number) => {
    const adjustedIndex = (index - rotation + 3) % 3;
    const distance = (adjustedIndex + 1) % 3;
    return distance;
  };

  const getZIndex = (pos: number) => {
    if (pos === 0) return 30;
    if (pos === 1) return 20;
    return 10;
  };

  const getScale = (pos: number) => {
    if (pos === 0) return 1;
    return 0.65;
  };

  const getOpacity = (pos: number) => {
    if (pos === 0) return 1;
    if (pos === 1) return 0.7;
    return 0.7;
  };

  const getYOffset = (pos: number) => {
    if (pos === 0) return 0;
    if (pos === 1) return -70;
    return 70;
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {/* Rotating Cards Container */}
      {!selectedCard && (
        <div className="relative w-full h-full flex items-center justify-center">
          {cards.map((card, index) => {
            const position = getCardPosition(index);
            const zIndex = getZIndex(position);
            const scale = getScale(position);
            const opacity = getOpacity(position);
            const yOffset = getYOffset(position);

            return (
              <div
                key={card.id}
                className={`absolute w-64 h-48 md:w-[40rem] md:h-[21rem] transition-all duration-700 ease-out ${!isMobile ? 'cursor-pointer' : ''}`}
                style={{
                  zIndex: zIndex,
                  transform: `translateY(${yOffset}px) scale(${scale})`,
                  opacity: opacity,
                  left: '50%',
                  marginLeft: '-128px',
                  marginTop: '-96px',
                  pointerEvents: isMobile ? 'none' : (position === 0 ? 'auto' : 'none'),
                }}
                onClick={!isMobile ? () => setSelectedCard(card) : undefined}
              >
                <img
                  src={card.image}
                  className="w-full h-full object-cover rounded-2xl shadow-2xl hover:shadow-3xl transition-shadow duration-300"
                  alt={`Card ${card.id}`}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Enlarged Card Modal */}
      {selectedCard && (
        <div className="fixed top-1/2 left-[66.67%] transform -translate-x-1/2 -translate-y-1/2 w-[50rem] h-[30rem] bg-black bg-opacity-50 rounded-3xl flex items-center justify-center z-50">
          <div className="relative w-[50rem] h-[30rem] rounded-3xl">
            <img
              src={selectedCard.image}
              className="w-full h-full object-cover rounded-3xl shadow-2xl"
              alt={`Enlarged Card ${selectedCard.id}`}
            />

            {/* Close Button */}
            <button
              onClick={() => setSelectedCard(null)}
              className="absolute -top-4 -right-4 bg-white rounded-full p-2 shadow-lg hover:bg-gray-100 transition-colors duration-200 z-60"
            >
              <X size={24} className="text-gray-900" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ========================= MAIN PAGE ========================= */
export default function Landing() {
  const [menu, setMenu] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [heroExpanded, setHeroExpanded] = useState<number[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  

  /* ----- MISSION ANIMATION ----- */
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.mission-top-left', {
        x: -60,
        opacity: 0,
        duration: 0.7,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.mission-top-left',
          start: 'top 85%',
          end: 'bottom 70%',
          scrub: false,
          toggleActions: 'play none none reverse'
        }
      });

      gsap.from('.mission-right', {
        x: 60,
        opacity: 0,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.mission-right',
          start: 'top 85%',
          end: 'bottom 70%',
          scrub: false,
          toggleActions: 'play none none reverse'
        }
      });

      gsap.from('.mission-bottom-left', {
        x: -60,
        opacity: 0,
        duration: 0.7,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.mission-bottom-left',
          start: 'top 85%',
          end: 'bottom 70%',
          scrub: false,
          toggleActions: 'play none none reverse'
        }
      });
    });

    return () => ctx.revert();
  }, []);

  const nav = (id: string) => {
    setMenu(false);
    if (id === 'login') return (window.location.href = '/auth/login');
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
  <div className="relative">
    
    {/* BACKGROUND */}
    <Background />

    {/* PAGE CONTENT ABOVE BACKGROUND */}
    <div className="relative z-10">


          
    <div className="relative z-10 bg-transparent"></div>
        {/* NAV */}
        <nav className="sticky top-0 z-50 bg-white">
          <div className="flex items-center justify-between px-6 py-4 md:grid md:grid-cols-3 md:gap-0">

            {/* LOGO */}
            <div className="flex gap-2 items-center md:justify-start">
              <div className="w-8 h-8 bg-gradient-to-r from-[#14b8a6] to-[#134E4A] rounded-lg" />
              <p className="font-bold text-[#14b8a6] text-xl">G1</p>
            </div>

            {/* DESKTOP NAV CENTER */}
            <div className="hidden md:flex gap-4 justify-center">
              <button onClick={() => nav('demo')} className="text-gray-700 hover:text-[#14b8a6] transition">
                Watch Demo
              </button>
              <button onClick={() => nav('mission')} className="text-gray-700 hover:text-[#14b8a6] transition">
                Mission
              </button>
              <button onClick={() => nav('features')} className="text-gray-700 hover:text-[#14b8a6] transition">
                Features
              </button>
              <button onClick={() => nav('footer')} className="text-gray-700 hover:text-[#14b8a6] transition">
                Contact
              </button>
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
                ['Watch Demo', 'demo'],
                ['Mission', 'mission'],
                ['Features', 'features'],
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

        {/* WHAT IS G1 */}
        <div className="px-4 pt-12 pb-4 md:pb-8 w-full">
          <h1 className="text-4xl md:text-5xl font-bold text-black text-center">The <em>complete</em> AI-powered platform for your health</h1>
          <p className="text-center text-gray-600 italic text-base mt-4">G1 remembers for you, explains your health, acts when you can't and cares for your loved one's with you.
</p>
        </div>

        {/* HERO TITLE */}
        <div className="px-4 pt-6 md:pt-12 pb-8 w-full">
          <h1 className="text-4xl md:text-5xl font-bold text-black text-center">Why you should join us</h1>
        </div>

        {/* ===== HERO ===== */}
        <section id="hero" className="px-8 pt-6 md:pt-20 pb-12 md:pb-20 w-full min-h-[80vh] relative">
          {/* MOBILE LAYOUT - Flex Column */}
          <div className="md:hidden">
            <div className="flex flex-col gap-10">
              {/* LEFT CARDS */}
              <div className="flex flex-col gap-4 w-full">
                {/* Disorganized Documents - Left, expands right */}
                <div className="relative flex items-center self-start">
                  <div
                    onClick={() => setHeroExpanded(prev => {
                      if (!Array.isArray(prev)) return [0];
                      return prev.includes(0) ? prev.filter(i => i !== 0) : [...prev, 0];
                    })}
                    className={`group relative w-24 h-24 rounded-l-2xl cursor-pointer transition-all duration-300 origin-left ${
                      'bg-[#14b8a6]'
                    } ${Array.isArray(heroExpanded) && heroExpanded.includes(0) ? 'w-72' : ''} text-white border-8 border-white/20 shadow-[4px_0_12px_rgba(255,255,255,0.3)] overflow-hidden`}
                  >
                    <div className="flex flex-col items-center justify-center h-full p-2">
                      <h3 className="text-xs font-normal text-center mb-1">Disorganized Documents?</h3>
                      <Lock className="w-8 h-8 scale-[110%] mx-auto" />
                    </div>
                    <div className={`absolute left-0 top-0 h-full w-full bg-blue-200 flex items-center justify-center p-3 transition-all duration-300 ${
                      Array.isArray(heroExpanded) && heroExpanded.includes(0) ? 'opacity-100' : 'opacity-0'
                    }`}>
                      <p className="text-xs text-gray-800 text-center">No more scattered documents, G1 has all your medical documents securely stored in one place</p>
                    </div>
                  </div>
                  <div
                    onClick={() => setHeroExpanded(prev => {
                      if (!Array.isArray(prev)) return [0];
                      return prev.includes(0) ? prev.filter(i => i !== 0) : [...prev, 0];
                    })}
                    className="w-6 h-24 bg-[#5eead4] rounded-r-2xl flex items-center justify-center cursor-pointer"
                  >
                    <span className="text-white font-bold text-lg">{heroExpanded.includes(0) ? '<' : '>'}</span>
                  </div>
                </div>

                {/* Emergency Services - Right, expands left */}
                <div className="relative flex items-center self-end">
                  <div
                    onClick={() => setHeroExpanded(heroExpanded.includes(1) ? heroExpanded.filter(i => i !== 1) : [...heroExpanded, 1])}
                    className="w-6 h-24 bg-[#207a74] rounded-l-2xl flex items-center justify-center cursor-pointer"
                  >
                    <span className="text-white font-bold text-lg">{heroExpanded.includes(1) ? '>' : '<'}</span>
                  </div>
                  <div
                    onClick={() => setHeroExpanded(heroExpanded.includes(1) ? heroExpanded.filter(i => i !== 1) : [...heroExpanded, 1])}
                    className={`group relative w-24 h-24 rounded-r-2xl cursor-pointer transition-all duration-300 origin-right ${
                      'bg-[#134E4A]'
                    } ${heroExpanded.includes(1) ? 'w-72' : ''} text-white border-8 border-white/20 shadow-[4px_0_12px_rgba(255,255,255,0.3)] overflow-hidden`}
                  >
                    <div className="flex flex-col items-center justify-center h-full p-2">
                      <h3 className="text-xs font-normal text-center mb-1">Emergency Services?</h3>
                      <AlertCircle className="w-8 h-8 scale-[110%] mx-auto" />
                    </div>
                    <div className={`absolute left-0 top-0 h-full w-full bg-blue-200 flex items-center justify-center p-3 transition-all duration-300 ${
                      heroExpanded.includes(1) ? 'opacity-100' : 'opacity-0'
                    }`}>
                      <p className="text-xs text-gray-800 text-center">Emergency services are one click away from reaching you at your most vulnerable times.</p>
                    </div>
                  </div>
                </div>

                {/* Unmonitored Wellness - Left, expands right */}
                <div className="relative flex items-center self-start">
                  <div
                    onClick={() => setHeroExpanded(prev => {
                      if (!Array.isArray(prev)) return [2];
                      return prev.includes(2) ? prev.filter(i => i !== 2) : [...prev, 2];
                    })}
                    className={`group relative w-24 h-24 rounded-l-2xl cursor-pointer transition-all duration-300 origin-left ${
                      'bg-[#14b8a6]'
                    } ${Array.isArray(heroExpanded) && heroExpanded.includes(2) ? 'w-72' : ''} text-white border-8 border-white/20 shadow-[4px_0_12px_rgba(255,255,255,0.3)] overflow-hidden`}
                  >
                    <div className="flex flex-col items-center justify-center h-full p-2">
                      <h3 className="text-xs font-normal text-center mb-1">Unmonitored Wellness?</h3>
                      <Users className="w-8 h-8 scale-[110%] mx-auto" />
                    </div>
                    <div className={`absolute left-0 top-0 h-full w-full bg-blue-200 flex items-center justify-center p-3 transition-all duration-300 ${
                      Array.isArray(heroExpanded) && heroExpanded.includes(2) ? 'opacity-100' : 'opacity-0'
                    }`}>
                      <p className="text-xs text-gray-800 text-center">Freely monitor the wellness of your loved ones with G1</p>
                    </div>
                  </div>
                  <div
                    onClick={() => setHeroExpanded(prev => {
                      if (!Array.isArray(prev)) return [2];
                      return prev.includes(2) ? prev.filter(i => i !== 2) : [...prev, 2];
                    })}
                    className="w-6 h-24 bg-[#5eead4] rounded-r-2xl flex items-center justify-center cursor-pointer"
                  >
                    <span className="text-white font-bold text-lg">{heroExpanded.includes(2) ? '<' : '>'}</span>
                  </div>
                </div>
              </div>

              {/* ROTATING CARDS CAROUSEL */}
              <div className="rounded-2xl overflow-hidden bg-transparent h-[64vh] relative top-0">
                <RotatingCardsCarousel isMobile={isMobile} />
              </div>
            </div>
          </div>

          {/* DESKTOP LAYOUT - Grid (Previous Code Style) */}
          <div className="hidden md:block">
            <div className="grid grid-cols-6 gap-1 scale-100">
              {/* LEFT CARDS */}
              <div className="col-span-1 flex flex-col gap-4 relative z-10 h-[55vh]">
                {[
                  {
                    title: 'Disorganized Documents?',
                    icon: Lock,
                    expandedText: 'No more scattered documents, G1 has all your medical documents securely stored in one place'
                  },
                  {
                    title: 'Emergency Requirements?',
                    icon: AlertCircle,
                    expandedText: 'Emergency services are one click away from reaching you at your most vulnerable times.'
                  },
                  {
                    title: 'Unmonitored Wellness?',
                    icon: Users,
                    expandedText: 'Freely monitor the wellness of your loved ones with G1'
                  }
                ].map(({ title, icon: Icon, expandedText }, i) => (
                  <div
                    key={i}
                    className={`group relative w-48 h-48 flex-1 rounded-2xl cursor-pointer transition-all duration-300 origin-bottom-right hover:w-96 hover:h-96 ${
                      i % 2 === 0 ? 'bg-[#14b8a6]' : 'bg-[#134E4A]'
                    } text-white border-8 border-white/20 shadow-[4px_0_12px_rgba(255,255,255,0.3)] overflow-hidden`}
                  >
                    <div className="flex flex-col items-center justify-center h-full p-4">
                      <h3 className="text-sm font-normal text-center mb-2">{title}</h3>
                      <Icon className="w-20 h-20 scale-[110%] mx-auto" />
                    </div>
                    <div className={`absolute left-0 top-0 h-full w-80 bg-blue-200 flex items-center justify-center p-4 transition-all duration-300 opacity-0 group-hover:opacity-100`}>
                      <p className="text-sm text-gray-800 text-center">{expandedText}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* ROTATING CARDS CAROUSEL */}
              <div className="col-span-5 rounded-2xl overflow-hidden bg-transparent h-[64vh]">
                <RotatingCardsCarousel isMobile={isMobile} />
              </div>
            </div>
          </div>
        </section>

        {/* GET STARTED */}
        <section className="px-4 py-20 text-center">
          <button
            onClick={() => nav('login')}
            className="bg-gradient-to-r from-[#14b8a6] to-[#134E4A] text-white px-8 py-4 rounded-full font-semibold text-lg hover:from-[#134E4A] hover:to-[#14b8a6] transition"
          >
            Get Started
          </button>
        </section>

        {/* DEMO */}
        <section id="demo" className="px-4 pb-8 max-w-6xl mx-auto -mt-4">
          <div className="h-[40vh] md:h-[50vh] rounded-3xl bg-gray-300 flex justify-center items-center">
            <div className="text-center">
              <p className="text-6xl">▶</p>
              <p className="text-gray-600 mt-2">Demo Video</p>
            </div>
          </div>
        </section>

        {/* PROMO */}
        <section className="px-4 py-10 text-center text-gray-700">
          <p className="text-xl">G1 For You.</p>
          <p>Your health. Your family. Our care.</p>
        </section>

        {/* ===== MISSION ===== */}
        <section id="mission" className="px-4 py-14 max-w-6xl mx-auto">
          <ScrollFloat>Why we're here</ScrollFloat>

          <div className="grid grid-cols-2 gap-6 mt-10">

            {/* LEFT CARDS */}
            <div className="flex flex-col gap-6">
              <div className="bg-[#288f88] h-48 rounded-3xl mission-top-left overflow-hidden">
                <img src="/images/G1/missionimg.jpg" className="w-full h-full object-cover" alt="Mission" />
              </div>
              <div className="bg-[#10736C] h-48 rounded-3xl mission-bottom-left flex flex-col items-start justify-center p-6 text-white">
                <Brain size={40} className="mb-3" />
                <h3 className="text-1xl font-bold">Helping you understand, not just store</h3>
                <p className="text-sm leading-relaxed">
                  Our AI explains what matters so you’re never left guessing.
                </p>
              </div>
            </div>

            {/* RIGHT BIG CARD */}
            <div className="bg-[#134E4A] rounded-3xl mission-right h-96 flex flex-col items-start justify-center p-8 text-white text-left">
              <Users size={48} className="mb-4" />
              <h3 className="text-1xl font-bold mb-4">We look out for your loved ones with you</h3>
              <p className="text-sm leading-relaxed mb-3">
               Keep track of important medical information for your loved ones even from miles away. Because caring doesn't stop at a distance.
              </p>
            </div>

          </div>
        </section>
{/* ===== FEATURES ===== */}
        <section id="features" className="px-4 py-8 max-w-5xl mx-auto">
          <ScrollReveal menuOpen={menu}>So what do we do exactly?</ScrollReveal>

          <div className="mt-[18vh]">

            <FeatureStackCard color="#14b8a6" top="md:top-[15vh] top-[20vh]">
              <div className="feature-card flex w-full justify-between items-center gap-8 md:flex-row flex-col">
                <div className="flex-1 text-left md:order-1 order-2">
                  <p className="text-2xl font-bold text-white mb-3">
                    Send Emergency Alerts
                  </p>
                  <p className="text-white text-sm leading-relaxed">
                    Help is 1 click away with our SOS button which alerts your family and emergency services.
                  </p>
                </div>
                <img src="images/G1/sosfeature.jpg" className="rounded-2xl flex-shrink-0 md:order-2 order-1" alt="Emergency SOS" />
              </div>
            </FeatureStackCard>

            <FeatureStackCard color="#134E4A" top="md:top-[15vh] top-[20vh]">
              <div className="feature-card flex w-full justify-between items-center gap-8 md:flex-row flex-col">
                <div className="flex-1 text-left md:order-1 order-2">
                  <p className="text-2xl font-bold text-white mb-3">
                    Store safely, explain clearly
                  </p>
                  <p className="text-white text-sm leading-relaxed">
                    AI summaries that help you understand your health, at your fingertips.
                  </p>
                </div>
                <img src="images/G1/safestorefeature.jpg" className="rounded-2xl flex-shrink-0 md:order-2 order-1" alt="Secure Storage" />
              </div>
            </FeatureStackCard>

            <FeatureStackCard color="#14b8a6" top="md:top-[15vh] top-[20vh]">
              <div className="feature-card flex w-full justify-between items-center gap-8 md:flex-row flex-col">
                <div className="flex-1 text-left md:order-1 order-2">
                  <p className="text-2xl font-bold text-white mb-3">
                    Ease Your Family Wellness Concerns
                  </p>
                  <p className="text-white text-sm leading-relaxed mt-[-10px]">
                    Monitor the health of your loved ones from anywhere.
                  </p>
                </div>
                <img src="images/G1/familyfeature.jpg" className="rounded-2xl flex-shrink-0 md:order-2 order-1" alt="Family Profiles" />
              </div>
            </FeatureStackCard>

          </div>
        </section>


        {/* FOOTER */}
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
                  <div className="w-8 h-8 bg-gradient-to-r from-[#134E4A] to-[#14b8a6] rounded-lg" />
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
                <div className="w-6 h-6 bg-gradient-to-r from-[#134E4A] to-[#14b8a6] rounded-lg" />
                <p className="font-bold text-[#14b8a6] text-lg">G1</p>
              </div>

              {/* CONTACT US AND LEGAL SIDE BY SIDE */}
              <div className="flex gap-4">
                {/* CONTACT US */}
                <div className="flex-1">
                  <h3 className="font-semibold text-xs mb-1">Contact Us</h3>
                  <div className="space-y-0.5 text-gray-400 text-xs">
                    <p>Email: hello@G1.com</p>
                    <p>Phone: 095117019</p>
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
    </div>
  );
}
