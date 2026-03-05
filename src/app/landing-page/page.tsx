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
    <div className="fixed inset-0 z-0 pointer-events-none" style={{ background: '#fafaf9' }}>
      <div style={{ position:'absolute', width:700, height:700, borderRadius:'50%', top:-200, left:-200,
        background:'radial-gradient(circle, rgba(13,148,136,0.13) 0%, transparent 70%)' }} />
      <div style={{ position:'absolute', width:500, height:500, borderRadius:'50%', top:'20%', right:-100,
        background:'radial-gradient(circle, rgba(13,148,136,0.09) 0%, transparent 70%)' }} />
      <div style={{ position:'absolute', width:600, height:600, borderRadius:'50%', bottom:'-10%', left:'25%',
        background:'radial-gradient(circle, rgba(19,78,74,0.10) 0%, transparent 70%)' }} />
    </div>
  );
}

const ScrollFloat = ({ children }: { children: React.ReactNode }) => {
  const ref = useRef<HTMLHeadingElement | null>(null);
  const chars = useMemo(() => {
    const text = typeof children === 'string' ? children : '';
    return text.split('').map((c, i) => (
      <span key={i} className="inline-block">{c === ' ' ? '\u00A0' : c}</span>
    ));
  }, [children]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const chars = el.querySelectorAll('span');
      gsap.fromTo(chars,
        { opacity: 0, yPercent: 120, scaleY: 2, scaleX: 0.6 },
        { opacity: 1, yPercent: 0, scaleY: 1, scaleX: 1, stagger: 0.05, ease: 'back.inOut(2)',
          scrollTrigger: { trigger: ref.current, start: 'top 85%', end: 'bottom 60%', scrub: 2 } }
      );
    });
    ScrollTrigger.refresh();
    return () => ctx.revert();
  }, []);
  return (
    <h2 ref={ref} style={{ fontFamily:"'Playfair Display', serif" }}
      className="text-4xl md:text-6xl font-bold text-white text-center overflow-hidden leading-tight">
      {chars}
    </h2>
  );
};

const FeaturesHeading = ({ children }: { children: React.ReactNode }) => {
  const ref = useRef<HTMLHeadingElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    gsap.set(el, { opacity: 0, x: -80 });
    const ctx = gsap.context(() => {
      gsap.to(el, { opacity: 1, x: 0, duration: 0.9, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none none' } });
    });
    ScrollTrigger.refresh();
    return () => ctx.revert();
  }, []);
  return (
    <h2 ref={ref} style={{ fontFamily:"'Playfair Display', serif" }}
      className="text-[clamp(2rem,4vw,3rem)] font-bold text-[#0f1a17] text-center leading-tight">
      {children}
    </h2>
  );
};

interface Card { id: number; image: string; }
interface RotatingCardsCarouselProps { isMobile: boolean; }

const RotatingCardsCarousel = ({ isMobile }: RotatingCardsCarouselProps) => {
  const cards: Card[] = [
    { id: 1, image: '/images/vytara/homepagess.png' },
    { id: 2, image: '/images/vytara/vaulpagess.png' },
    { id: 3, image: '/images/vytara/profilepagess.png' },
  ];
  const [rotation, setRotation] = useState(0);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  useEffect(() => {
    if (selectedCard !== null) return;
    const interval = setInterval(() => { setRotation((prev) => (prev + 1) % 3); }, 2000);
    return () => clearInterval(interval);
  }, [selectedCard]);
  const getCardPosition = (index: number) => { const adjustedIndex = (index - rotation + 3) % 3; return (adjustedIndex + 1) % 3; };
  const getZIndex  = (pos: number) => pos === 0 ? 30 : pos === 1 ? 20 : 10;
  const getScale   = (pos: number) => pos === 0 ? 1 : 0.65;
  const getOpacity = (pos: number) => pos === 0 ? 1 : 0.7;
  const getYOffset = (pos: number) => pos === 0 ? 0 : pos === 1 ? -70 : 70;
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {!selectedCard && (
        <div className="relative w-full h-full flex items-center justify-center">
          {cards.map((card, index) => {
            const position = getCardPosition(index);
            return (
              <div key={card.id}
                className={`absolute w-64 h-48 md:w-[40rem] md:h-[21rem] transition-all duration-700 ease-out ${!isMobile ? 'cursor-pointer' : ''}`}
                style={{ zIndex: getZIndex(position), transform: `translateY(${getYOffset(position)}px) scale(${getScale(position)})`,
                  opacity: getOpacity(position), left: '50%', marginLeft: '-128px', marginTop: '-96px',
                  pointerEvents: isMobile ? 'none' : (position === 0 ? 'auto' : 'none') }}
                onClick={!isMobile ? () => setSelectedCard(card) : undefined}>
                <img src={card.image} className="w-full h-full object-cover rounded-2xl shadow-2xl hover:shadow-3xl transition-shadow duration-300" alt={`Card ${card.id}`} />
              </div>
            );
          })}
        </div>
      )}
      {selectedCard && (
        <div className="fixed top-1/2 left-[66.67%] transform -translate-x-1/2 -translate-y-1/2 w-[50rem] h-[30rem] bg-black bg-opacity-50 rounded-3xl flex items-center justify-center z-50">
          <div className="relative w-[50rem] h-[30rem] rounded-3xl">
            <img src={selectedCard.image} className="w-full h-full object-cover rounded-3xl shadow-2xl" alt={`Enlarged Card ${selectedCard.id}`} />
            <button onClick={() => setSelectedCard(null)} className="absolute -top-4 -right-4 bg-white rounded-full p-2 shadow-lg hover:bg-gray-100 transition-colors duration-200 z-60">
              <X size={24} className="text-gray-900" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

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

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.mission-top-left', { x: -60, opacity: 0, duration: 0.7, ease: 'power3.out',
        scrollTrigger: { trigger: '.mission-top-left', start: 'top 85%', end: 'bottom 70%', scrub: false, toggleActions: 'play none none reverse' } });
      gsap.from('.mission-right', { x: 60, opacity: 0, duration: 0.8, ease: 'power3.out',
        scrollTrigger: { trigger: '.mission-right', start: 'top 85%', end: 'bottom 70%', scrub: false, toggleActions: 'play none none reverse' } });
      gsap.from('.mission-bottom-left', { x: -60, opacity: 0, duration: 0.7, ease: 'power3.out',
        scrollTrigger: { trigger: '.mission-bottom-left', start: 'top 85%', end: 'bottom 70%', scrub: false, toggleActions: 'play none none reverse' } });
    });
    return () => ctx.revert();
  }, []);

  const nav = (id: string) => {
    setMenu(false);
    if (id === 'login') return (window.location.href = '/auth/login');
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="relative" style={{ fontFamily:"'DM Sans', sans-serif", background:'#fafaf9', color:'#0f1a17', overflowX:'hidden' }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@300;400;500;600&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes floatCard { 0%,100%{transform:translateY(0px) rotate(-1deg)} 50%{transform:translateY(-10px) rotate(1deg)} }
        @keyframes floatCardB { 0%,100%{transform:translateY(0px) rotate(2deg)} 50%{transform:translateY(-14px) rotate(-1deg)} }
        @keyframes floatCardC { 0%,100%{transform:translateY(0px) rotate(-0.5deg)} 50%{transform:translateY(-8px) rotate(0.5deg)} }
        .anim-badge  { animation: fadeUp 0.6s 0.0s ease both; }
        .anim-h1     { animation: fadeUp 0.6s 0.1s ease both; }
        .anim-sub    { animation: fadeUp 0.6s 0.2s ease both; }
        .anim-cta    { animation: fadeUp 0.6s 0.3s ease both; }
        .anim-cards  { animation: fadeUp 0.6s 0.45s ease both; }
        .btn-primary-hover:hover  { transform:translateY(-2px); box-shadow:0 8px 30px rgba(13,148,136,0.45) !important; }
        .pain-card-hover:hover    { transform:translateY(-6px); box-shadow:0 20px 50px rgba(0,0,0,0.13) !important; }
        .feat-card-hover:hover    { transform:translateY(-6px); box-shadow:0 20px 50px rgba(0,0,0,0.13) !important; }
        .mission-card-hover:hover { background:rgba(255,255,255,0.12) !important; transform:translateX(5px); }
        .nav-link-hover:hover     { color:#0d9488 !important; }
        .footer-link-hover:hover  { color:#99f6e4 !important; }
        /* individual pill floats — pure Y, no rotation, staggered so no two adjacent pills ever meet */
        @keyframes fp1 { 0%,100%{transform:translateY(0px)}   50%{transform:translateY(-8px)} }
        @keyframes fp2 { 0%,100%{transform:translateY(-5px)}  50%{transform:translateY(5px)} }
        @keyframes fp3 { 0%,100%{transform:translateY(0px)}   50%{transform:translateY(-6px)} }
        @keyframes fp4 { 0%,100%{transform:translateY(-4px)}  50%{transform:translateY(6px)} }
        @keyframes fp5 { 0%,100%{transform:translateY(0px)}   50%{transform:translateY(-7px)} }
        @keyframes fp6 { 0%,100%{transform:translateY(-3px)}  50%{transform:translateY(5px)} }
        @keyframes fp0 { 0%,100%{transform:translateY(0px)}   50%{transform:translateY(-10px)} }
        .float-main  { animation: fp0 7s ease-in-out infinite; }
        .float-p1    { animation: fp1 5.2s ease-in-out 0.0s infinite; }
        .float-p2    { animation: fp2 6.1s ease-in-out 0.9s infinite; }
        .float-p3    { animation: fp3 4.8s ease-in-out 1.6s infinite; }
        .float-p4    { animation: fp4 5.7s ease-in-out 0.4s infinite; }
        .float-p5    { animation: fp5 6.4s ease-in-out 1.2s infinite; }
        .float-p6    { animation: fp6 5.0s ease-in-out 2.0s infinite; }
        .float-a { animation: fp1 5.2s ease-in-out 0.0s infinite; }
        .float-b { animation: fp2 6.1s ease-in-out 0.9s infinite; }
        .float-c { animation: fp3 4.8s ease-in-out 1.6s infinite; }
        @media (max-width: 767px) {
          .hero-layout { flex-direction: column !important; }
          .hero-visual { display: none !important; }
          .hero-text { flex: none !important; width: 100% !important; text-align: center !important; }
          .mission-pillars { grid-template-columns: 1fr !important; gap: 0 !important; }
          .mission-statement { flex-direction: column !important; gap: 24px !important; margin-bottom: 32px !important; }
          .mission-statement > div:first-child { flex: none !important; width: 100% !important; text-align: center !important; }
          .mission-statement > div:last-child { flex: none !important; width: 100% !important; padding-top: 0 !important; }
          #mission { padding: 48px 20px !important; }
          .mission-pillars > div { padding: 24px 20px !important; border-top: none !important; border-left: 3px solid rgba(13,148,136,0.5); border-bottom: 1px solid rgba(255,255,255,0.06) !important; }
          .pain-section { padding: 40px 20px 24px !important; }
          .pain-heading { max-width: 100% !important; font-size: clamp(1.6rem,6vw,2.4rem) !important; text-align: center !important; margin-bottom: 20px !important; }
          .pain-eyebrow { text-align: center !important; }
          .pain-grid-mobile { grid-template-columns: 1fr !important; gap: 10px !important; }
          #features { padding: 48px 16px !important; }
          .feat-3col { grid-template-columns: 1fr !important; gap: 10px !important; }
          .feat-2col { grid-template-columns: 1fr !important; gap: 10px !important; }
          .feat-profile-grid { grid-template-columns: 1fr !important; gap: 16px !important; padding: 24px 20px !important; }
          .feat-carecircle-grid { grid-template-columns: 1fr !important; }
          #demo { padding: 40px 16px 48px !important; }
          #features > div > div:first-child { margin-bottom: 40px !important; }
          .feat-2col > div { flex-direction: column !important; }
          .feat-2col > div > div:first-child { width: 100% !important; height: 72px !important; }
          .feat-carecircle-grid > div { border-right: none !important; border-bottom: 1px solid #f3f4f6; }
          section:first-of-type { min-height: unset !important; padding: 80px 20px 40px !important; }
        }
      `}</style>

      <Background />

      <div className="relative z-10">

        {/* NAV */}
        <nav style={{ position:'sticky', top:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'14px 20px', background:'rgba(250,250,249,0.88)', backdropFilter:'blur(16px)', borderBottom:'1px solid rgba(13,148,136,0.12)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, fontFamily:"'Playfair Display', serif", fontSize:'1.4rem', fontWeight:700, color:'#0f1a17' }}>
            <div style={{ width:34, height:34, borderRadius:8, background:'linear-gradient(135deg,#0d9488,#134e4a)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:'0.78rem', fontWeight:700, boxShadow:'0 4px 14px rgba(13,148,136,0.4)' }}>G1</div>
            G1 Health
          </div>
          <div className="hidden md:flex" style={{ gap:36 }}>
            {[['Watch Demo','demo'],['Mission','mission'],['Features','features'],['Contact','footer']].map(([t,id]) => (
              <button key={id} onClick={() => nav(id)} className="nav-link-hover"
                style={{ background:'none', border:'none', cursor:'pointer', color:'#374151', fontSize:'0.9rem', fontWeight:500, transition:'color 0.2s' }}>{t}</button>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <button onClick={() => nav('login')} className="btn-primary-hover"
              style={{ background:'linear-gradient(135deg,#0d9488,#134e4a)', color:'white', border:'none', cursor:'pointer',
                padding:'11px 28px', borderRadius:100, fontSize:'0.9rem', fontWeight:600,
                fontFamily:"'DM Sans', sans-serif", boxShadow:'0 4px 20px rgba(13,148,136,0.35)', transition:'all 0.2s' }}>
              Get Started
            </button>
            <button onClick={() => setMenu(!menu)} className="md:hidden" style={{ background:'none', border:'none', cursor:'pointer' }}>
              {menu ? <X className="text-[#134e4a]" /> : <Menu className="text-[#134e4a]" />}
            </button>
          </div>
        </nav>

        {menu && (
          <div className="bg-white shadow-md md:hidden" style={{ position:'relative', zIndex:49, borderTop:'1px solid #f3f4f6' }}>
            {[['Watch Demo','demo'],['Mission','mission'],['Features','features'],['Contact','footer']].map(([t,id],index,array) => (
              <div key={id}>
                <button onClick={() => nav(id)} className="block px-6 py-4 text-left w-full"
                  style={{ background:'none', border:'none', cursor:'pointer', color:'#134E4A', fontWeight:500, fontSize:'1rem' }}>{t}</button>
                {index < array.length - 1 && <hr style={{ borderColor:'#f3f4f6' }} />}
              </div>
            ))}
          </div>
        )}
        <div style={{ height:1, background:'linear-gradient(90deg,#134E4A,#14b8a6,#134E4A)', opacity:0.35 }} />


        {/* ══ HERO ══ */}
        <section style={{ minHeight:'100vh', display:'flex', alignItems:'center', padding:'100px 24px 60px', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', inset:0, zIndex:0,
            background:'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(13,148,136,0.15) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 10% 60%, rgba(13,148,136,0.08) 0%, transparent 60%), radial-gradient(ellipse 30% 40% at 90% 70%, rgba(13,148,136,0.08) 0%, transparent 60%)' }} />

          <div className="hero-layout" style={{ maxWidth:1200, margin:'0 auto', width:'100%', display:'flex', alignItems:'center', gap:64, position:'relative', zIndex:1 }}>

            {/* LEFT: Text */}
            <div className="hero-text" style={{ flex:'0 0 50%' }}>
              <div className="anim-badge" style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(13,148,136,0.10)', border:'1px solid rgba(13,148,136,0.25)', borderRadius:100, padding:'7px 18px', fontSize:'0.8rem', fontWeight:600, color:'#0f766e', marginBottom:28, letterSpacing:'0.05em', textTransform:'uppercase' }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'#0d9488', animation:'pulse 2s infinite' }} />
                🩺 AI-Powered Health Companion
              </div>
              <h1 className="anim-h1" style={{ fontFamily:"'Playfair Display', serif", fontSize:'clamp(2.8rem,4.5vw,4.4rem)', fontWeight:900, lineHeight:1.08, marginBottom:0 }}>
                The <em style={{ fontStyle:'italic', color:'#0d9488' }}>complete</em> AI platform for your health
              </h1>
              <p className="anim-sub" style={{ fontSize:'1.1rem', color:'#6b7280', maxWidth:440, lineHeight:1.7, margin:'24px 0 0', fontWeight:400 }}>
                One platform to manage records, medications, family health, and emergencies — for your whole family.
              </p>
              <div className="anim-cta" style={{ display:'flex', gap:16, alignItems:'center', marginTop:36, flexWrap:'wrap' }}>
                <button onClick={() => nav('login')} className="btn-primary-hover"
                  style={{ background:'linear-gradient(135deg,#0d9488,#134e4a)', color:'white', border:'none', cursor:'pointer',
                    padding:'13px 32px', borderRadius:100, fontSize:'1rem', fontWeight:600,
                    fontFamily:"'DM Sans', sans-serif", boxShadow:'0 4px 20px rgba(13,148,136,0.35)', transition:'all 0.2s' }}>
                  Get Started
                </button>
                <button onClick={() => nav('demo')}
                style={{ display:'flex', alignItems:'center', gap:8, background:'none', border:'none', cursor:'pointer', color:'#134e4a', fontWeight:700, fontSize:'0.95rem', fontFamily:"'DM Sans', sans-serif", transition:'all 0.2s' }}>
                <span style={{ width:38, height:38, borderRadius:'50%', background:'rgba(13,148,136,0.18)', border:'1.5px solid rgba(13,148,136,0.5)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.9rem', color:'#0d9488' }}>▶</span>
               Watch Demo
               </button>
              </div>
            </div>

            {/* RIGHT: Floating UI mockup cards — all absolutely positioned to fill full height */}
            <div className="hero-visual anim-cards" style={{ flex:'0 0 46%', position:'relative', height:600 }}>

              {/* Main card — top */}
              <div className="float-main" style={{ position:'absolute', top:0, left:'10%', right:0, borderRadius:20, background:'white', boxShadow:'0 24px 64px rgba(13,78,74,0.18)', overflow:'hidden', border:'1px solid rgba(13,148,136,0.1)' }}>
                <div style={{ background:'linear-gradient(135deg,#134e4a,#0d9488)', padding:'14px 20px', display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:'rgba(255,255,255,0.4)' }} />
                  <div style={{ width:8, height:8, borderRadius:'50%', background:'rgba(255,255,255,0.4)' }} />
                  <div style={{ width:8, height:8, borderRadius:'50%', background:'rgba(255,255,255,0.4)' }} />
                  <p style={{ color:'rgba(255,255,255,0.7)', fontSize:'0.72rem', marginLeft:8, fontWeight:500 }}>Medical Vault — Tanya Sehgal</p>
                </div>
                <div style={{ padding:'20px' }}>
                  <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                    {['Lab Reports','Prescriptions','Insurance'].map((t,i) => (
                      <span key={t} style={{ fontSize:'0.65rem', fontWeight:700, padding:'3px 10px', borderRadius:100, background: i===0 ? 'rgba(13,148,136,0.12)' : '#f3f4f6', color: i===0 ? '#0f766e' : '#6b7280' }}>{t}</span>
                    ))}
                  </div>
                  {[
                    { name:'Blood Test Report', date:'Feb 2025', tag:'Lab', color:'#dcfce7', tc:'#166534' },
                    { name:'Dr. Sharma Prescription', date:'Jan 2025', tag:'Rx', color:'#dbeafe', tc:'#1e40af' },
                    { name:'Apollo Insurance Card', date:'Dec 2024', tag:'Insurance', color:'#fef9c3', tc:'#854d0e' },
                  ].map(({ name, date, tag, color, tc }) => (
                    <div key={name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', borderRadius:10, background:'#fafaf9', marginBottom:6, border:'1px solid #f3f4f6' }}>
                      <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                        <span style={{ fontSize:'1rem' }}>📄</span>
                        <div>
                          <p style={{ fontSize:'0.75rem', fontWeight:600, color:'#0f1a17', margin:0 }}>{name}</p>
                          <p style={{ fontSize:'0.65rem', color:'#9ca3af', margin:0 }}>{date}</p>
                        </div>
                      </div>
                      <span style={{ fontSize:'0.58rem', fontWeight:700, padding:'2px 8px', borderRadius:100, background:color, color:tc }}>{tag}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Floating pill — AI Summary — left, mid */}
              <div className="float-p1" style={{ position:'absolute', top:280, left:0, borderRadius:16, background:'white', padding:'13px 16px', boxShadow:'0 12px 32px rgba(0,0,0,0.10)', display:'flex', alignItems:'center', gap:10, border:'1px solid rgba(13,148,136,0.12)', minWidth:210 }}>
                <div style={{ width:34, height:34, borderRadius:9, background:'rgba(13,148,136,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>🧠</div>
                <div>
                  <p style={{ fontSize:'0.65rem', color:'#3e4146', margin:0 }}>AI Summary ready</p>
                  <p style={{ fontSize:'0.78rem', fontWeight:700, color:'#0f1a17', margin:0 }}>Blood report analysed ✓</p>
                </div>
              </div>

              {/* Floating pill — Care Circle — right, mid */}
              <div className="float-p2" style={{ position:'absolute', top:280, right:4, borderRadius:16, background:'#0d9488', padding:'13px 17px', boxShadow:'0 12px 32px rgba(13,148,136,0.3)', display:'flex', alignItems:'center', gap:10, minWidth:195 }}>
                <div style={{ width:34, height:34, borderRadius:9, background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>👨‍👩‍👧</div>
                <div>
                  <p style={{ fontSize:'0.65rem', color:'rgba(255, 255, 255, 0.86)', margin:0 }}>Care Circle</p>
                  <p style={{ fontSize:'0.78rem', fontWeight:700, color:'white', margin:0 }}>4 members connected</p>
                </div>
              </div>

              {/* Floating pill — Appointment — center-left, lower-mid */}
              <div className="float-p3" style={{ position:'absolute', top:375, left:0, borderRadius:16, background:'#134e4a', padding:'13px 16px', boxShadow:'0 12px 32px rgba(13,78,74,0.28)', display:'flex', alignItems:'center', gap:10, minWidth:205 }}>
                <div style={{ width:34, height:34, borderRadius:9, background:'rgba(255,255,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>📅</div>
                <div>
                  <p style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.5)', margin:0 }}>Next Appointment</p>
                  <p style={{ fontSize:'0.78rem', fontWeight:700, color:'white', margin:0 }}>Dr. Sharma · Tomorrow</p>
                </div>
              </div>

              {/* Floating pill — Health Score — right, lower-mid */}
              <div className="float-p4" style={{ position:'absolute', top:375, right:4, borderRadius:16, background:'white', padding:'12px 16px', boxShadow:'0 12px 32px rgba(0,0,0,0.10)', display:'flex', alignItems:'center', gap:10, border:'1px solid rgba(13,148,136,0.12)', minWidth:185 }}>
                <div style={{ width:34, height:34, borderRadius:9, background:'rgba(13,148,136,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>❤️</div>
                <div>
                  <p style={{ fontSize:'0.65rem', color:'#3e4146', margin:0 }}>Health Score</p>
                  <p style={{ fontSize:'0.78rem', fontWeight:700, color:'#0f1a17', margin:0 }}>87 / 100 · Good</p>
                </div>
              </div>

              {/* Floating pill — Emergency — left, lower */}
              <div className="float-p5" style={{ position:'absolute', top:470, left:0, borderRadius:16, background:'#0d9488', padding:'14px 18px', boxShadow:'0 16px 40px rgba(13,148,136,0.3)', display:'flex', alignItems:'center', gap:12, minWidth:200 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.1rem' }}>🚨</div>
                <div>
                  <p style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.86)', margin:0 }}>Emergency SOS</p>
                  <p style={{ fontSize:'0.82rem', fontWeight:700, color:'white', margin:0 }}>Profile shared instantly</p>
                </div>
              </div>

              {/* Floating pill — Medication — right, bottom */}
              <div className="float-p6" style={{ position:'absolute', top:470, right:4, borderRadius:16, background:'#134e4a', padding:'12px 16px', boxShadow:'0 12px 32px rgba(13,78,74,0.28)', display:'flex', alignItems:'center', gap:10, minWidth:190 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:'rgba(255,255,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem' }}>💊</div>
                <div>
                  <p style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.5)', margin:0 }}>Medication reminder</p>
                  <p style={{ fontSize:'0.78rem', fontWeight:700, color:'white', margin:0 }}>Metformin · 8:00 AM</p>
                </div>
              </div>

            </div>

          </div>
        </section>

        {/* ══ PAIN POINTS ══ */}
        <section className="pain-section" style={{ padding:'72px 24px' }}>
          <div style={{ maxWidth:1200, margin:'0 auto' }}>
            <p className="pain-eyebrow" style={{ fontSize:'0.75rem', fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'#0d9488', marginBottom:12, textAlign:'center' }}>Why G1 Exists</p>
            <h2 className="pain-heading" style={{ fontFamily:"'Playfair Display', serif", fontSize:'clamp(2rem,4vw,3.2rem)', fontWeight:800, lineHeight:1.12, textAlign:'center', marginBottom:24 }}>
              Healthcare is fragmented.<br /><em style={{ fontStyle:'italic', color:'#0d9488' }}>G1</em> brings it together.
            </h2>
            <div className="pain-grid-mobile" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
              {[
                { icon:'🗂️', title:'Scattered records', text:'All medical documents stored and accessible in one secure place — prescriptions, reports, discharge summaries.', bg:'#0f766e', titleColor:'white', textColor:'rgba(255,255,255,0.75)', border:'none', iconBg:'rgba(255,255,255,0.15)' },
                { icon:'🚨', title:'Emergency preparedness', text:'One tap shares your full medical profile with your Care Circle. Allergies, medications, and contacts — instantly.', bg:'#134e4a', titleColor:'white', textColor:'rgba(255,255,255,0.75)', border:'none', iconBg:'rgba(255,255,255,0.15)' },
                { icon:'👨‍👩‍👧', title:'Family health management', text:'One account manages health profiles for the whole family — children, elderly parents, and yourself.', bg:'#0d9488', titleColor:'white', textColor:'rgba(255,255,255,0.75)', border:'none', iconBg:'rgba(255,255,255,0.15)' },
              ].map(({ icon, title, text, bg, titleColor, textColor, border, iconBg }) => (
                <div key={title} className="pain-card-hover"
                  style={{ borderRadius:16, padding:'28px 22px', background:bg, border, position:'relative', overflow:'hidden', transition:'transform 0.25s, box-shadow 0.25s' }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:iconBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.3rem', marginBottom:14 }}>{icon}</div>
                  <h3 style={{ fontSize:'1rem', fontWeight:700, color:titleColor, marginBottom:8 }}>{title}</h3>
                  <p style={{ fontSize:'0.85rem', lineHeight:1.65, color:textColor }}>{text}</p>
                  <div style={{ position:'absolute', bottom:-20, right:-20, width:80, height:80, borderRadius:'50%', background:'rgba(255,255,255,0.06)' }} />
                </div>
              ))}
            </div>
          </div>
        </section>


        {/* ══ VIDEO ══ */}
        <section id="demo" style={{ padding:'40px 24px 80px', textAlign:'center' }}>
          <div style={{ maxWidth:900, margin:'0 auto' }}>
            <p style={{ fontSize:'0.75rem', fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'#0d9488', marginBottom:16 }}>See It In Action</p>
            <h2 style={{ fontFamily:"'Playfair Display', serif", fontSize:'clamp(1.8rem,3.5vw,2.6rem)', fontWeight:800, maxWidth:500, margin:'0 auto 48px', lineHeight:1.2 }}>
              Watch how G1 works for your family
            </h2>
            <div style={{ borderRadius:24, overflow:'hidden', position:'relative', aspectRatio:'16/9', boxShadow:'0 30px 80px rgba(13,78,74,0.25)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
              <div style={{ position:'absolute', inset:0, background:'linear-gradient(135deg,#134e4a,#0d524e)', opacity:0.95 }} />
              <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px)', backgroundSize:'40px 40px' }} />
              <div style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
                <div style={{ width:72, height:72, borderRadius:'50%', background:'white', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 8px 30px rgba(0,0,0,0.3)', transition:'transform 0.2s', cursor:'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.transform='scale(1.1)')}
                  onMouseLeave={e => (e.currentTarget.style.transform='scale(1)')}>
                  <span style={{ color:'#134e4a', fontSize:'1.8rem', marginLeft:4 }}>▶</span>
                </div>
                <p style={{ color:'rgba(255,255,255,0.6)', fontSize:'0.85rem', fontWeight:500, letterSpacing:'0.06em' }}>Demo Video · 2 min</p>
              </div>
            </div>
          </div>
        </section>


        {/* ══ MISSION ══ */}
        <section id="mission" style={{ padding:'72px 24px', background:'#0f1a17', color:'white', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:-200, left:-200, width:600, height:600, borderRadius:'50%', border:'1px solid rgba(13,148,136,0.12)', pointerEvents:'none' }} />
          <div style={{ position:'absolute', bottom:-100, right:-100, width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle,rgba(13,148,136,0.15),transparent 70%)', pointerEvents:'none' }} />
          <div style={{ maxWidth:1200, margin:'0 auto', position:'relative', zIndex:1 }}>
            <div className="mission-top-left">
              <p style={{ fontSize:'0.75rem', fontWeight:700, letterSpacing:'0.15em', textTransform:'uppercase', color:'#0d9488', marginBottom:24 }}>Our Mission</p>
              <div className="mission-statement" style={{ display:'flex', alignItems:'flex-start', gap:48, flexWrap:'wrap', marginBottom:48 }}>
                <div style={{ flex:'1 1 280px', minWidth:0 }}>
                  <ScrollFloat>Why we built G1</ScrollFloat>
                </div>
                <div style={{ flex:'1 1 340px', minWidth:0, paddingTop:8 }}>
                  <p style={{ fontSize:'1.05rem', color:'rgba(255,255,255,0.65)', lineHeight:1.85, marginBottom:28 }}>
                    Medical records are scattered. Families are unprepared for emergencies. Most people don't understand their own health reports.
                  </p>
                  <p style={{ fontSize:'1.05rem', color:'rgba(255,255,255,0.65)', lineHeight:1.85, marginBottom:28 }}>
                    G1 fixes all three — one platform to store records, manage family health, stay prepared, and stay connected.
                  </p>
                  <div style={{ borderLeft:'3px solid #0d9488', paddingLeft:20 }}>
                    <p style={{ fontSize:'0.88rem', color:'rgba(255,255,255,0.3)', lineHeight:1.7, fontStyle:'italic' }}>"We're building the health platform we wish our families had."</p>
                    <p style={{ fontSize:'0.78rem', color:'#0d9488', fontWeight:600, marginTop:8 }}>— G1 Team, Mumbai</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mission-right mission-pillars" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:2 }}>
              {[
                { num:'01', icon:'🧠', title:'Clarity',   sub:'Understand your health',    text:'AI turns medical reports and prescriptions into plain language — no jargon, no confusion.', accent:'#0d9488' },
                { num:'02', icon:'⚡', title:'Readiness', sub:'Prepared for emergencies',   text:'Your profile is always ready to share. One tap reaches your Care Circle and emergency services.', accent:'#14b8a6' },
                { num:'03', icon:'🤝', title:'Together',  sub:'One account, whole family',  text:'Manage profiles for children, elderly parents, and yourself — all from a single G1 account.', accent:'#5eead4' },
              ].map(({ num, icon, title, sub, text, accent }, i) => (
                <div key={num} style={{ padding:'36px 32px', borderTop:`3px solid ${accent}`, background: i===1 ? 'rgba(13,148,136,0.06)' : 'transparent' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                    <span style={{ fontFamily:"'Playfair Display', serif", fontSize:'2.4rem', fontWeight:900, color:accent, opacity:0.2, lineHeight:1 }}>{num}</span>
                    <span style={{ fontSize:'1.5rem' }}>{icon}</span>
                  </div>
                  <h4 style={{ fontFamily:"'Playfair Display', serif", fontSize:'1.3rem', fontWeight:800, color:'white', marginBottom:4 }}>{title}</h4>
                  <p style={{ fontSize:'0.72rem', fontWeight:600, color:accent, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>{sub}</p>
                  <p style={{ fontSize:'0.85rem', color:'rgba(255,255,255,0.4)', lineHeight:1.7 }}>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>


        {/* ══ FEATURES ══ */}
        <section id="features" style={{ padding:'100px 24px', background:'#fafaf9' }}>
          <div style={{ maxWidth:1200, margin:'0 auto' }}>
            <div style={{ textAlign:'center', marginBottom:72 }}>
              <p style={{ fontSize:'0.75rem', fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'#0d9488', marginBottom:16 }}>What We Do</p>
              <FeaturesHeading>Everything G1 does for you</FeaturesHeading>
            </div>

            {/* GROUP 1 */}
            <div style={{ marginBottom:48 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
                <div style={{ height:1, flex:1, background:'linear-gradient(90deg,#0d9488,transparent)' }} />
                <p style={{ fontSize:'0.7rem', fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:'#0d9488', whiteSpace:'nowrap' }}>Smart Health Management</p>
                <div style={{ height:1, flex:1, background:'linear-gradient(270deg,#0d9488,transparent)' }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }} className="feat-3col">
                {[
                  { emoji:'📅', tag:'Appointments', title:'Appointment Tracking', bullets:['View all upcoming appointments','Get reminders before each visit'] },
                  { emoji:'💊', tag:'Medications', title:'Medication Management', bullets:['Set daily dose reminders','Track all ongoing medications','Get alerted when a course ends'] },
                  { emoji:'🚨', tag:'Emergency SOS', title:'Emergency SOS', bullets:['Save emergency contacts','One tap sends your medical profile to contacts & services'] },
                ].map(({ emoji, tag, title, bullets }) => (
                  <div key={title} style={{ borderRadius:20, overflow:'hidden', background:'white', border:'1px solid #e5e7eb', boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
                    <div style={{ height:88, background:'linear-gradient(135deg,#0d9488,#134e4a)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2.4rem' }}>{emoji}</div>
                    <div style={{ padding:'20px 24px' }}>
                      <span style={{ fontSize:'0.62rem', fontWeight:700, letterSpacing:'0.09em', textTransform:'uppercase', color:'#0f766e', background:'rgba(13,148,136,0.1)', padding:'2px 9px', borderRadius:100 }}>{tag}</span>
                      <h3 style={{ fontFamily:"'Playfair Display', serif", fontSize:'1rem', fontWeight:800, color:'#0f1a17', margin:'10px 0 11px' }}>{title}</h3>
                      {bullets.map(b => (
                        <div key={b} style={{ display:'flex', gap:7, alignItems:'baseline', marginBottom:5 }}>
                          <span style={{ color:'#0d9488', fontWeight:700, fontSize:'0.75rem', flexShrink:0 }}>✓</span>
                          <p style={{ fontSize:'0.82rem', color:'#4b5563', lineHeight:1.45, margin:0 }}>{b}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* GROUP 2 */}
            <div style={{ marginBottom:48 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
                <div style={{ height:1, flex:1, background:'linear-gradient(90deg,#14b8a6,transparent)' }} />
                <p style={{ fontSize:'0.7rem', fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:'#14b8a6', whiteSpace:'nowrap' }}>Medical Records & AI</p>
                <div style={{ height:1, flex:1, background:'linear-gradient(270deg,#14b8a6,transparent)' }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }} className="feat-2col">
                {[
                  { emoji:'🗂️', tag:'Medical Vault', title:'Medical Vault', dark:true,
                    bullets:['Store lab reports, prescriptions, insurance & bills','Organised by category — access anything instantly','Your full history, always available'] },
                  { emoji:'📄', tag:'AI Summarizer', title:'AI Summarizer', dark:true,
                    bullets:['Upload a document — get an instant plain-language summary','See key highlights and trends','Understand complex reports without medical expertise'] },
                ].map(({ emoji, tag, title, dark, bullets }) => (
                  <div key={title} style={{ borderRadius:20, overflow:'hidden',
                    background: dark ? '#f0fdfa' : 'white',
                    border: dark ? 'none' : '1px solid #e5e7eb',
                    boxShadow: dark ? '0 4px 24px rgba(13,78,74,0.1)' : '0 2px 12px rgba(0,0,0,0.04)',
                    display:'flex' }}>
                    <div style={{ width:100, flexShrink:0, background: dark ? 'linear-gradient(135deg,#134e4a,#0f766e)' : 'linear-gradient(135deg,#f0fdf4,#ccfbf1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2.2rem' }}>{emoji}</div>
                    <div style={{ padding:'22px 26px', flex:1 }}>
                      <span style={{ fontSize:'0.62rem', fontWeight:700, letterSpacing:'0.09em', textTransform:'uppercase', color:'#0f766e', background:'rgba(13,148,136,0.1)', padding:'2px 9px', borderRadius:100 }}>{tag}</span>
                      <h3 style={{ fontFamily:"'Playfair Display', serif", fontSize:'1rem', fontWeight:800, color:'#0f1a17', margin:'10px 0 11px' }}>{title}</h3>
                      {bullets.map(b => (
                        <div key={b} style={{ display:'flex', gap:7, alignItems:'baseline', marginBottom:5 }}>
                          <span style={{ color:'#0d9488', fontWeight:700, fontSize:'0.75rem', flexShrink:0 }}>✓</span>
                          <p style={{ fontSize:'0.82rem', color:'#4b5563', lineHeight:1.45, margin:0 }}>{b}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* GROUP 3 */}
            <div style={{ marginBottom:48 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
                <div style={{ height:1, flex:1, background:'linear-gradient(90deg,#0d9488,transparent)' }} />
                <p style={{ fontSize:'0.7rem', fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:'#0d9488', whiteSpace:'nowrap' }}>Multi-Profile System</p>
                <div style={{ height:1, flex:1, background:'linear-gradient(270deg,#0d9488,transparent)' }} />
              </div>
              <div style={{ borderRadius:24, background:'linear-gradient(135deg,#134e4a,#0f1a17)', padding:'44px 48px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:48, alignItems:'center' }} className="feat-profile-grid">
                <div>
                  <h3 style={{ fontFamily:"'Playfair Display', serif", fontSize:'clamp(1.4rem,2.5vw,1.9rem)', fontWeight:800, color:'white', marginBottom:12, lineHeight:1.25 }}>One account.<br />Your whole family.</h3>
                  <p style={{ fontSize:'0.9rem', color:'rgba(255,255,255,0.5)', lineHeight:1.7, marginBottom:20 }}>
                    Ideal for children under 18, elderly parents without smartphones, or anyone who needs help managing their health.
                  </p>
                  <div style={{ padding:'11px 15px', borderRadius:12, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', fontSize:'0.79rem', color:'rgba(255,255,255,0.38)', lineHeight:1.6 }}>
                    <span style={{ color:'#5eead4', fontWeight:600 }}>💡 Tip: </span>If the family member has their own phone number, create a separate G1 account for them instead.
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {[
                    { icon:'➕', text:'Create profiles for family members' },
                    { icon:'🔄', text:'Switch between profiles in one tap' },
                    { icon:'📋', text:'Manage their appointments, medications & documents separately' },
                  ].map(({ icon, text }) => (
                    <div key={text} style={{ display:'flex', gap:12, alignItems:'center', padding:'12px 16px', borderRadius:12, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}>
                      <span style={{ fontSize:'1rem', flexShrink:0 }}>{icon}</span>
                      <p style={{ fontSize:'0.84rem', color:'rgba(255,255,255,0.6)', lineHeight:1.5, margin:0 }}>{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* GROUP 4 */}
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
                <div style={{ height:1, flex:1, background:'linear-gradient(90deg,#0d9488,transparent)' }} />
                <p style={{ fontSize:'0.7rem', fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:'#0d9488', whiteSpace:'nowrap' }}>Our MOAT — Care Circle</p>
                <div style={{ height:1, flex:1, background:'linear-gradient(270deg,#0d9488,transparent)' }} />
              </div>
              <div style={{ borderRadius:24, overflow:'hidden', border:'1px solid #e5e7eb', boxShadow:'0 4px 24px rgba(0,0,0,0.06)' }}>
                <div style={{ background:'linear-gradient(135deg,#0d9488,#0f766e)', padding:'36px 48px' }}>
                  <h3 style={{ fontFamily:"'Playfair Display', serif", fontSize:'clamp(1.3rem,2.5vw,1.8rem)', fontWeight:800, color:'white', marginBottom:8, lineHeight:1.2 }}>Care Circle</h3>
                  <p style={{ fontSize:'0.9rem', color:'rgba(255,255,255,0.65)', lineHeight:1.65, maxWidth:560 }}>Connect trusted family and friends. Give each person the right level of access to your health data.</p>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', background:'white' }} className="feat-carecircle-grid">
                  <div style={{ padding:'28px 32px', borderRight:'1px solid #f3f4f6' }}>
                    <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10 }}>
                      <span style={{ fontSize:'1.1rem' }}>🤝</span>
                      <p style={{ fontWeight:700, color:'#0f1a17', fontSize:'0.88rem', margin:0 }}>Friends — Emergency Card</p>
                    </div>
                    <p style={{ fontSize:'0.8rem', color:'#6b7280', marginBottom:12, lineHeight:1.5 }}>Friends can view your Emergency Card which includes:</p>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
                      {['Blood Group','Allergies','Current Medications','Emergency Contacts','Preferred Hospital','Insurer & Plan','Chronic Diseases','Special Instructions'].map(item => (
                        <div key={item} style={{ display:'flex', gap:5, alignItems:'baseline' }}>
                          <span style={{ color:'#0d9488', fontWeight:700, fontSize:'0.72rem', flexShrink:0 }}>✓</span>
                          <p style={{ fontSize:'0.76rem', color:'#4b5563', lineHeight:1.4, margin:0 }}>{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding:'28px 32px' }}>
                    <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10 }}>
                      <span style={{ fontSize:'1.1rem' }}>👨‍👩‍👧</span>
                      <p style={{ fontWeight:700, color:'#0f1a17', fontSize:'0.88rem', margin:0 }}>Family — Full Access</p>
                    </div>
                    <p style={{ fontSize:'0.8rem', color:'#6b7280', marginBottom:12, lineHeight:1.5 }}>Family members can view, edit, and manage:</p>
                    {['Medical data & vault documents','Appointments & medications','Linked family profiles'].map(item => (
                      <div key={item} style={{ display:'flex', gap:7, alignItems:'baseline', marginBottom:6 }}>
                        <span style={{ color:'#0d9488', fontWeight:700, fontSize:'0.75rem', flexShrink:0 }}>✓</span>
                        <p style={{ fontSize:'0.81rem', color:'#4b5563', lineHeight:1.45, margin:0 }}>{item}</p>
                      </div>
                    ))}
                    <div style={{ marginTop:14, padding:'10px 13px', borderRadius:10, background:'#fff7ed', border:'1px solid #fed7aa', display:'flex', gap:7 }}>
                      <span style={{ fontSize:'0.85rem', flexShrink:0 }}>⚠️</span>
                      <p style={{ fontSize:'0.74rem', color:'#92400e', lineHeight:1.5, margin:0 }}><strong>Only add immediate family.</strong> They can edit your data and manage your profiles.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </section>


        {/* ══ FOOTER ══ */}
        <footer id="footer" style={{ background:'#0f1a17', color:'white', padding:'64px 24px 32px' }}>
          <div style={{ maxWidth:1200, margin:'0 auto' }}>
            <div className="hidden md:grid" style={{ gridTemplateColumns:'2fr 1fr 1fr', gap:48, marginBottom:48 }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:10, fontFamily:"'Playfair Display', serif", fontSize:'1.3rem', fontWeight:700, marginBottom:14 }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,#0d9488,#134e4a)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:'0.75rem', fontWeight:700 }}>G1</div>
                  G1 Health
                </div>
                <p style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.9rem', lineHeight:1.7, maxWidth:260 }}>Healthcare, beautifully reimagined. Your health. Your family. Your control.</p>
              </div>
              <div>
                <h4 style={{ fontSize:'0.8rem', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(255,255,255,0.4)', marginBottom:16 }}>Contact Us</h4>
                <div style={{ color:'rgba(255,255,255,0.65)', fontSize:'0.9rem', lineHeight:2 }}>
                  <p>Email : hello@G1.com</p>
                  <p>Phone : 09511701519</p>
                  <p>Address : 327, 3rd Floor,<br />Ajmera Sikova,<br />ICRC, Ghatkopar West,<br />Mumbai 400086</p>
                </div>
              </div>
              <div>
                <h4 style={{ fontSize:'0.8rem', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(255,255,255,0.4)', marginBottom:16 }}>Legal</h4>
                {[['Privacy Policy','/legal/privacy-policy'],['Terms of Service','/legal/terms-of-service'],['Cookie Policy','/legal/cookie-policy'],['Health Data Privacy','/legal/health-data-privacy']].map(([t,h]) => (
                  <Link key={t} href={h} className="footer-link-hover" style={{ display:'block', color:'rgba(255,255,255,0.65)', textDecoration:'none', fontSize:'0.9rem', marginBottom:10, transition:'color 0.2s' }}>{t}</Link>
                ))}
              </div>
            </div>

            <div className="md:hidden">
              <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:16 }}>
                <div style={{ width:24, height:24, background:'linear-gradient(135deg,#0d9488,#134e4a)', borderRadius:6 }} />
                <p style={{ fontFamily:"'Playfair Display', serif", fontWeight:700, color:'#14b8a6', fontSize:'1.1rem' }}>G1</p>
              </div>
              <div style={{ display:'flex', gap:16 }}>
                <div style={{ flex:1 }}>
                  <h3 style={{ fontWeight:600, fontSize:'0.7rem', marginBottom:4, color:'rgba(255,255,255,0.5)' }}>Contact Us</h3>
                  <div style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.7rem', lineHeight:1.9 }}>
                    <p>Email: hello@G1.com</p><p>Phone: 09511701519</p>
                    <p>327, 3rd Floor, Ajmera Sikova, ICRC, Ghatkopar West, Mumbai 400086</p>
                  </div>
                </div>
                <div style={{ flex:1 }}>
                  <h3 style={{ fontWeight:600, fontSize:'0.7rem', marginBottom:4, color:'rgba(255,255,255,0.5)' }}>Legal</h3>
                  {[['Privacy Policy','/legal/privacy-policy'],['Terms of Service','/legal/terms-of-service'],['Cookie Policy','/legal/cookie-policy'],['Health Data Privacy','/legal/health-data-privacy']].map(([t,h]) => (
                    <Link key={t} href={h} style={{ display:'block', color:'rgba(255,255,255,0.5)', textDecoration:'none', fontSize:'0.7rem', marginBottom:6 }}>{t}</Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="hidden md:flex" style={{ borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:28, justifyContent:'space-between', alignItems:'center' }}>
              <p style={{ color:'rgba(255,255,255,0.35)', fontSize:'0.8rem' }}>© {new Date().getFullYear()} G1. All rights reserved.</p>
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
}