'use client';

import React, {
  useState,
  useRef,
  useMemo,
  useLayoutEffect,
  useEffect
} from 'react';

import { Menu, X, Play } from 'lucide-react';
import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import BrandLogo from '@/components/BrandLogo';
gsap.registerPlugin(ScrollTrigger);

const shouldReduceMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const navItems = [
  ['Watch Demo', 'demo'],
  ['Mission', 'mission'],
  ['Features', 'features'],
  ['Contact', 'footer'],
] as const;

const legalLinks = [
  ['Privacy Policy', '/legal/privacy-policy'],
  ['Terms of Service', '/legal/terms-of-service'],
  ['Cookie Policy', '/legal/cookie-policy'],
  ['Health Data Privacy', '/legal/health-data-privacy'],
] as const;

function Background() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none" style={{ background: '#fafaf9' }}>
      <div className="background-orb background-orb-a" style={{ position:'absolute', width:700, height:700, borderRadius:'50%', top:-200, left:-200,
        background:'radial-gradient(circle, rgba(13,148,136,0.13) 0%, transparent 70%)' }} />
      <div className="background-orb background-orb-b" style={{ position:'absolute', width:500, height:500, borderRadius:'50%', top:'20%', right:-100,
        background:'radial-gradient(circle, rgba(13,148,136,0.09) 0%, transparent 70%)' }} />
      <div className="background-orb background-orb-c" style={{ position:'absolute', width:600, height:600, borderRadius:'50%', bottom:'-10%', left:'25%',
        background:'radial-gradient(circle, rgba(19,78,74,0.10) 0%, transparent 70%)' }} />
    </div>
  );
}

const ScrollFloat = ({ children }: { children: React.ReactNode }) => {
  const ref = useRef<HTMLHeadingElement | null>(null);
  const words = useMemo(() => {
    const text = typeof children === 'string' ? children : '';
    const splitWords = text.split(' ');
    return splitWords.map((word, wordIndex) => (
      <React.Fragment key={wordIndex}>
        <span className="inline-block whitespace-nowrap">
          {word.split('').map((char, charIndex) => (
            <span key={`${wordIndex}-${charIndex}`} className="float-char inline-block">
              {char}
            </span>
          ))}
        </span>
        {wordIndex < splitWords.length - 1 ? ' ' : null}
      </React.Fragment>
    ));
  }, [children]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || shouldReduceMotion()) return;
    const ctx = gsap.context(() => {
      const chars = el.querySelectorAll('.float-char');
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
      {words}
    </h2>
  );
};

const FeaturesHeading = ({ children }: { children: React.ReactNode }) => {
  const ref = useRef<HTMLHeadingElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || shouldReduceMotion()) return;
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

export default function Landing() {
  const [menu, setMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );
  const [showDemoPlayButton, setShowDemoPlayButton] = useState(true);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const demoVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useLayoutEffect(() => {
    const root = pageRef.current;
    if (!root || shouldReduceMotion()) return;

    const ctx = gsap.context(() => {
      const heroTimeline = gsap.timeline({ defaults: { ease: 'power3.out' } });

      heroTimeline
        .from('.nav-shell', { y: -18, opacity: 0, duration: 0.75 })
        .from('.hero-copy > *', { y: 32, opacity: 0, duration: 0.8, stagger: 0.12 }, '-=0.42')
        .from('.hero-visual-shell', { y: 40, opacity: 0, scale: 0.98, duration: 1 }, '-=0.55')
        .from('.hero-pill', { opacity: 0, duration: 0.45, stagger: 0.08 }, '-=0.66');

      gsap.utils.toArray<HTMLElement>('.reveal-section').forEach((section) => {
        gsap.from(section, {
          y: 42,
          opacity: 0,
          duration: 0.85,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 84%',
            toggleActions: 'play none none reverse',
          },
        });
      });

      gsap.utils.toArray<HTMLElement>('.stagger-group').forEach((group) => {
        const items = group.querySelectorAll('.stagger-item');
        if (!items.length) return;

        gsap.from(items, {
          y: 28,
          opacity: 0,
          duration: 0.72,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: group,
            start: 'top 84%',
            toggleActions: 'play none none reverse',
          },
        });
      });
    }, root);

    ScrollTrigger.refresh();
    return () => ctx.revert();
  }, []);

  const nav = (id: string) => {
    setMenu(false);
    if (id === 'login') {
      window.location.assign('/auth/login');
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const playDemoVideo = () => {
    const video = demoVideoRef.current;
    if (!video) return;
    setShowDemoPlayButton(false);
    const playAttempt = video.play();
    if (playAttempt && typeof playAttempt.catch === 'function') {
      playAttempt.catch(() => setShowDemoPlayButton(true));
    }
  };

  const resetDemoVideoPreview = () => {
    const video = demoVideoRef.current;
    if (video) {
      video.currentTime = 0.001;
    }
    setShowDemoPlayButton(true);
  };

  return (
    <div ref={pageRef} className="relative" style={{ fontFamily:"'DM Sans', sans-serif", background:'#fafaf9', color:'#0f1a17', overflowX:'hidden' }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@300;400;500;600&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes menuReveal {
          from { opacity:0; transform:translateY(-14px) scaleY(0.98); }
          to { opacity:1; transform:translateY(0) scaleY(1); }
        }
        @keyframes haloPulse {
          0%,100% { box-shadow:0 18px 40px rgba(15,26,23,0.35), 0 0 0 0 rgba(255,255,255,0.16); }
          50% { box-shadow:0 24px 52px rgba(15,26,23,0.42), 0 0 0 16px rgba(255,255,255,0); }
        }
        @keyframes orbDriftA {
          0%,100% { transform:translate3d(0,0,0) scale(1); }
          50% { transform:translate3d(18px,-24px,0) scale(1.04); }
        }
        @keyframes orbDriftB {
          0%,100% { transform:translate3d(0,0,0) scale(1); }
          50% { transform:translate3d(-20px,16px,0) scale(1.05); }
        }
        @keyframes orbDriftC {
          0%,100% { transform:translate3d(0,0,0) scale(1); }
          50% { transform:translate3d(14px,-18px,0) scale(1.03); }
        }
        .background-orb { filter: blur(18px); will-change: transform; }
        .background-orb-a { animation: orbDriftA 18s ease-in-out infinite; }
        .background-orb-b { animation: orbDriftB 22s ease-in-out infinite; }
        .background-orb-c { animation: orbDriftC 20s ease-in-out infinite; }
        .nav-shell { box-shadow:0 12px 30px rgba(15,26,23,0.06); }
        .nav-brand { transition:transform 220ms ease, filter 220ms ease; }
        .nav-brand:hover { transform:translateY(-1px); filter:saturate(1.08); }
        .nav-link-hover,
        .footer-link-hover { transition:color 0.2s ease, transform 0.2s ease; }
        .nav-link-hover:hover { color:#0d9488 !important; transform:translateY(-1px); }
        .footer-link-hover:hover { color:#99f6e4 !important; transform:translateX(2px); }
        .menu-panel {
          animation:menuReveal 0.34s cubic-bezier(0.22,1,0.36,1) both;
          transform-origin:top center;
          backdrop-filter:blur(18px);
        }
        .menu-link {
          animation:menuReveal 0.38s cubic-bezier(0.22,1,0.36,1) both;
          transition:background 0.2s ease, padding-left 0.22s ease, color 0.2s ease;
        }
        .menu-link:hover { background:rgba(20,184,166,0.08) !important; padding-left:1.8rem; color:#0f766e; }
        .btn-primary-hover:hover { transform:translateY(-3px); box-shadow:0 16px 36px rgba(13,148,136,0.38) !important; }
        .cta-secondary { transition:transform 0.25s ease, color 0.25s ease; }
        .cta-secondary:hover { transform:translateY(-2px); color:#0f766e !important; }
        .cta-secondary-icon { transition:transform 0.28s ease, background 0.28s ease, box-shadow 0.28s ease; }
        .cta-secondary:hover .cta-secondary-icon {
          transform:scale(1.08);
          background:rgba(13,148,136,0.24) !important;
          box-shadow:0 12px 30px rgba(13,148,136,0.22);
        }
        .hero-float-card { transition:box-shadow 0.35s ease, border-color 0.35s ease, background 0.35s ease; }
        .hero-float-card:hover {
          box-shadow:0 28px 72px rgba(13,78,74,0.22) !important;
          border-color:rgba(13,148,136,0.28) !important;
        }
        .hero-row { transition:transform 0.22s ease, background 0.22s ease, border-color 0.22s ease; }
        .hero-row:hover {
          transform:translateX(4px);
          background:#f0fdfa !important;
          border-color:rgba(13,148,136,0.18) !important;
        }
        .card-hover-lift {
          transition:transform 0.32s cubic-bezier(0.22,1,0.36,1), box-shadow 0.32s ease, border-color 0.32s ease;
        }
        .card-hover-lift:hover {
          transform:translateY(-10px);
          box-shadow:0 26px 56px rgba(15,23,42,0.12) !important;
          border-color:rgba(13,148,136,0.22) !important;
        }
        .mission-card-hover { transition:background 0.28s ease, transform 0.28s ease; }
        .mission-card-hover:hover {
          background:rgba(255,255,255,0.1) !important;
          transform:translateY(-6px);
        }
        .video-shell { transition:transform 0.38s ease, box-shadow 0.38s ease; }
        .video-shell::after {
          content:'';
          position:absolute;
          inset:0;
          background:linear-gradient(135deg, rgba(13,148,136,0.16), transparent 35%, rgba(15,26,23,0.18));
          opacity:0.15;
          pointer-events:none;
          transition:opacity 0.3s ease;
        }
        .video-shell:hover { transform:translateY(-6px); box-shadow:0 34px 90px rgba(13,78,74,0.28) !important; }
        .video-shell:hover::after { opacity:0.22; }
        .play-button {
          animation:haloPulse 2.4s ease-in-out infinite;
          transition:transform 0.24s ease, background 0.24s ease, border-color 0.24s ease;
        }
        .play-button:hover {
          transform:translate(-50%, -50%) scale(1.05) !important;
          background:rgba(15,26,23,0.86) !important;
          border-color:rgba(255,255,255,0.46) !important;
        }
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
        @media (prefers-reduced-motion: reduce) {
          .background-orb,
          .menu-panel,
          .menu-link,
          .play-button,
          .float-main,
          .float-p1,
          .float-p2,
          .float-p3,
          .float-p4,
          .float-p5,
          .float-p6 { animation:none !important; }
          .nav-brand,
          .nav-link-hover,
          .footer-link-hover,
          .menu-link,
          .btn-primary-hover,
          .cta-secondary,
          .cta-secondary-icon,
          .hero-float-card,
          .hero-row,
          .card-hover-lift,
          .mission-card-hover,
          .video-shell,
          .play-button { transition:none !important; }
        }
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
        <nav className="nav-shell" style={{ position:'sticky', top:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'14px 20px', background:'rgba(250,250,249,0.88)', backdropFilter:'blur(16px)', borderBottom:'1px solid rgba(13,148,136,0.12)' }}>
          <div className="nav-brand" style={{ display:'flex', alignItems:'center' }}>
            <BrandLogo variant="wordmark" width={138} priority />
          </div>
          <div className="hidden md:flex" style={{ gap:36 }}>
            {navItems.map(([t, id]) => (
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
          <div className="menu-panel bg-white shadow-md md:hidden" style={{ position:'relative', zIndex:49, borderTop:'1px solid #f3f4f6', background:'rgba(255,255,255,0.88)' }}>
            {navItems.map(([t, id], index, array) => (
              <div key={id}>
                <button onClick={() => nav(id)} className="menu-link block px-6 py-4 text-left w-full"
                  style={{ background:'none', border:'none', cursor:'pointer', color:'#134E4A', fontWeight:500, fontSize:'1rem', animationDelay:`${index * 0.05}s` }}>{t}</button>
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
            <div className="hero-text hero-copy" style={{ flex:'0 0 50%' }}>
              <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(13,148,136,0.10)', border:'1px solid rgba(13,148,136,0.25)', borderRadius:100, padding:'7px 18px', fontSize:'0.8rem', fontWeight:600, color:'#0f766e', marginBottom:28, letterSpacing:'0.05em', textTransform:'uppercase' }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'#0d9488', animation:'pulse 2s infinite' }} />
                🩺 AI-Powered Health Companion
              </div>
              <h1 style={{ fontFamily:"'Playfair Display', serif", fontSize:'clamp(2.8rem,4.5vw,4.4rem)', fontWeight:900, lineHeight:1.08, marginBottom:0 }}>
                The <em style={{ fontStyle:'italic', color:'#0d9488' }}>complete</em> AI platform for your health
              </h1>
              <p style={{ fontSize:'1.1rem', color:'#6b7280', maxWidth:440, lineHeight:1.7, margin:'24px 0 0', fontWeight:400 }}>
                One platform to manage records, medications, family health, and emergencies — for your whole family.
              </p>
              <div style={{ display:'flex', gap:16, alignItems:'center', marginTop:36, flexWrap:'wrap' }}>
                <button onClick={() => nav('login')} className="btn-primary-hover"
                  style={{ background:'linear-gradient(135deg,#0d9488,#134e4a)', color:'white', border:'none', cursor:'pointer',
                    padding:'13px 32px', borderRadius:100, fontSize:'1rem', fontWeight:600,
                    fontFamily:"'DM Sans', sans-serif", boxShadow:'0 4px 20px rgba(13,148,136,0.35)', transition:'all 0.2s' }}>
                  Get Started
                </button>
                <button onClick={() => nav('demo')} className="cta-secondary"
                style={{ display:'flex', alignItems:'center', gap:8, background:'none', border:'none', cursor:'pointer', color:'#134e4a', fontWeight:700, fontSize:'0.95rem', fontFamily:"'DM Sans', sans-serif", transition:'all 0.2s' }}>
                <span className="cta-secondary-icon" style={{ width:38, height:38, borderRadius:'50%', background:'rgba(13,148,136,0.18)', border:'1.5px solid rgba(13,148,136,0.5)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.9rem', color:'#0d9488' }}>▶</span>
               Watch Demo
               </button>
              </div>
            </div>

            {/* RIGHT: Floating UI mockup cards — all absolutely positioned to fill full height */}
            <div className="hero-visual hero-visual-shell" style={{ flex:'0 0 46%', position:'relative', height:600 }}>

              {/* Main card — top */}
              <div className="float-main hero-float-card" style={{ position:'absolute', top:0, left:'10%', right:0, borderRadius:20, background:'white', boxShadow:'0 24px 64px rgba(13,78,74,0.18)', overflow:'hidden', border:'1px solid rgba(13,148,136,0.1)' }}>
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
                    <div key={name} className="hero-row" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', borderRadius:10, background:'#fafaf9', marginBottom:6, border:'1px solid #f3f4f6' }}>
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
              <div className="float-p1 hero-pill hero-float-card" style={{ position:'absolute', top:280, left:0, borderRadius:16, background:'white', padding:'13px 16px', boxShadow:'0 12px 32px rgba(0,0,0,0.10)', display:'flex', alignItems:'center', gap:10, border:'1px solid rgba(13,148,136,0.12)', minWidth:210 }}>
                <div style={{ width:34, height:34, borderRadius:9, background:'rgba(13,148,136,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>🧠</div>
                <div>
                  <p style={{ fontSize:'0.65rem', color:'#3e4146', margin:0 }}>AI Summary ready</p>
                  <p style={{ fontSize:'0.78rem', fontWeight:700, color:'#0f1a17', margin:0 }}>Blood report analysed ✓</p>
                </div>
              </div>

              {/* Floating pill — Care Circle — right, mid */}
              <div className="float-p2 hero-pill hero-float-card" style={{ position:'absolute', top:280, right:4, borderRadius:16, background:'#0d9488', padding:'13px 17px', boxShadow:'0 12px 32px rgba(13,148,136,0.3)', display:'flex', alignItems:'center', gap:10, minWidth:195 }}>
                <div style={{ width:34, height:34, borderRadius:9, background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>👨‍👩‍👧</div>
                <div>
                  <p style={{ fontSize:'0.65rem', color:'rgba(255, 255, 255, 0.86)', margin:0 }}>Care Circle</p>
                  <p style={{ fontSize:'0.78rem', fontWeight:700, color:'white', margin:0 }}>4 members connected</p>
                </div>
              </div>

              {/* Floating pill — Appointment — center-left, lower-mid */}
              <div className="float-p3 hero-pill hero-float-card" style={{ position:'absolute', top:375, left:0, borderRadius:16, background:'#134e4a', padding:'13px 16px', boxShadow:'0 12px 32px rgba(13,78,74,0.28)', display:'flex', alignItems:'center', gap:10, minWidth:205 }}>
                <div style={{ width:34, height:34, borderRadius:9, background:'rgba(255,255,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>📅</div>
                <div>
                  <p style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.5)', margin:0 }}>Next Appointment</p>
                  <p style={{ fontSize:'0.78rem', fontWeight:700, color:'white', margin:0 }}>Dr. Sharma · Tomorrow</p>
                </div>
              </div>

              {/* Floating pill — Health Score — right, lower-mid */}
              <div className="float-p4 hero-pill hero-float-card" style={{ position:'absolute', top:375, right:4, borderRadius:16, background:'white', padding:'12px 16px', boxShadow:'0 12px 32px rgba(0,0,0,0.10)', display:'flex', alignItems:'center', gap:10, border:'1px solid rgba(13,148,136,0.12)', minWidth:185 }}>
                <div style={{ width:34, height:34, borderRadius:9, background:'rgba(13,148,136,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>❤️</div>
                <div>
                  <p style={{ fontSize:'0.65rem', color:'#3e4146', margin:0 }}>Health Score</p>
                  <p style={{ fontSize:'0.78rem', fontWeight:700, color:'#0f1a17', margin:0 }}>87 / 100 · Good</p>
                </div>
              </div>

              {/* Floating pill — Emergency — left, lower */}
              <div className="float-p5 hero-pill hero-float-card" style={{ position:'absolute', top:470, left:0, borderRadius:16, background:'#0d9488', padding:'14px 18px', boxShadow:'0 16px 40px rgba(13,148,136,0.3)', display:'flex', alignItems:'center', gap:12, minWidth:200 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.1rem' }}>🚨</div>
                <div>
                  <p style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.86)', margin:0 }}>Emergency SOS</p>
                  <p style={{ fontSize:'0.82rem', fontWeight:700, color:'white', margin:0 }}>Profile shared instantly</p>
                </div>
              </div>

              {/* Floating pill — Medication — right, bottom */}
              <div className="float-p6 hero-pill hero-float-card" style={{ position:'absolute', top:470, right:4, borderRadius:16, background:'#134e4a', padding:'12px 16px', boxShadow:'0 12px 32px rgba(13,78,74,0.28)', display:'flex', alignItems:'center', gap:10, minWidth:190 }}>
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
          <div className="reveal-section" style={{ maxWidth:1200, margin:'0 auto' }}>
            <p className="pain-eyebrow" style={{ fontSize:'0.75rem', fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'#0d9488', marginBottom:12, textAlign:'center' }}>Why Carevie Exists</p>
            <h2 className="pain-heading" style={{ fontFamily:"'Playfair Display', serif", fontSize:'clamp(2rem,4vw,3.2rem)', fontWeight:800, lineHeight:1.12, textAlign:'center', marginBottom:24 }}>
              Healthcare is fragmented.<br /><em style={{ fontStyle:'italic', color:'#0d9488' }}>Carevie</em> brings it together.
            </h2>
            <div className="pain-grid-mobile stagger-group" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
              {[
                { icon:'🗂️', title:'Organized records', text:'All medical documents stored and accessible in one secure place — prescriptions, reports, discharge summaries.', bg:'#0f766e', titleColor:'white', textColor:'rgba(255,255,255,0.75)', border:'none', iconBg:'rgba(255,255,255,0.15)' },
                { icon:'🚨', title:'Emergency preparedness', text:'One tap shares your full medical profile with your Care Circle. Allergies, medications, and contacts — instantly.', bg:'#134e4a', titleColor:'white', textColor:'rgba(255,255,255,0.75)', border:'none', iconBg:'rgba(255,255,255,0.15)' },
                { icon:'👨‍👩‍👧', title:'Family health management', text:'One account manages health profiles for the whole family — children, elderly parents, and yourself.', bg:'#0d9488', titleColor:'white', textColor:'rgba(255,255,255,0.75)', border:'none', iconBg:'rgba(255,255,255,0.15)' },
              ].map(({ icon, title, text, bg, titleColor, textColor, border, iconBg }) => (
                <div key={title} className="stagger-item card-hover-lift"
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
          <div className="reveal-section" style={{ maxWidth:900, margin:'0 auto' }}>
            <p style={{ fontSize:'0.75rem', fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'#0d9488', marginBottom:16 }}>See It In Action</p>
            <h2 style={{ fontFamily:"'Playfair Display', serif", fontSize:'clamp(1.8rem,3.5vw,2.6rem)', fontWeight:800, maxWidth:500, margin:'0 auto 48px', lineHeight:1.2 }}>
              Watch how Carevie works for your family
            </h2>
            <div className="video-shell" style={{ position:'relative', borderRadius:24, overflow:'hidden', boxShadow:'0 30px 80px rgba(13,78,74,0.25)' }}>
              <video 
                ref={demoVideoRef}
                src="/videos/Demo Video.mp4#t=0.001" 
                preload="auto"
                playsInline
                onPlay={() => setShowDemoPlayButton(false)}
                onEnded={resetDemoVideoPreview}
                controls 
                style={{ width: '100%', display: 'block' }}
              />
              {showDemoPlayButton && (
                <button
                  type="button"
                  onClick={playDemoVideo}
                  className="play-button"
                  aria-label="Play demo video"
                  style={{
                    position:'absolute',
                    top:'50%',
                    left:'50%',
                    transform:'translate(-50%, -50%)',
                    width:isMobile ? 72 : 92,
                    height:isMobile ? 72 : 92,
                    borderRadius:'50%',
                    border:'1px solid rgba(255,255,255,0.28)',
                    background:'rgba(15,26,23,0.78)',
                    backdropFilter:'blur(14px)',
                    display:'flex',
                    alignItems:'center',
                    justifyContent:'center',
                    boxShadow:'0 18px 40px rgba(15,26,23,0.35)',
                    cursor:'pointer',
                    zIndex:2,
                    transition:'transform 0.2s ease, background 0.2s ease'
                  }}
                >
                  <Play
                    size={isMobile ? 28 : 34}
                    fill="white"
                    color="white"
                    strokeWidth={2.2}
                    style={{ marginLeft: isMobile ? 4 : 5 }}
                  />
                </button>
              )}
            </div>
          </div>
        </section>


        {/* ══ MISSION ══ */}
        <section id="mission" style={{ padding:'72px 24px', background:'#0f1a17', color:'white', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:-200, left:-200, width:600, height:600, borderRadius:'50%', border:'1px solid rgba(13,148,136,0.12)', pointerEvents:'none' }} />
          <div style={{ position:'absolute', bottom:-100, right:-100, width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle,rgba(13,148,136,0.15),transparent 70%)', pointerEvents:'none' }} />
          <div style={{ maxWidth:1200, margin:'0 auto', position:'relative', zIndex:1 }}>
            <div className="mission-top-left reveal-section">
              <p style={{ fontSize:'0.75rem', fontWeight:700, letterSpacing:'0.15em', textTransform:'uppercase', color:'#0d9488', marginBottom:24 }}>Our Mission</p>
              <div className="mission-statement" style={{ display:'flex', alignItems:'flex-start', gap:48, flexWrap:'wrap', marginBottom:48 }}>
                <div style={{ flex:'1 1 280px', minWidth:0 }}>
                  <ScrollFloat>Why we built Carevie</ScrollFloat>
                </div>
                <div style={{ flex:'1 1 340px', minWidth:0, paddingTop:8 }}>
                  <p style={{ fontSize:'1.05rem', color:'rgba(255,255,255,0.65)', lineHeight:1.85, marginBottom:28 }}>
                    Medical records are scattered. Families are unprepared for emergencies. Most people don&apos;t understand their own health reports.
                  </p>
                  <p style={{ fontSize:'1.05rem', color:'rgba(255,255,255,0.65)', lineHeight:1.85, marginBottom:28 }}>
                    Carevie fixes all three — one platform to store records, manage family health, stay prepared, and stay connected.
                  </p>
                  <div style={{ borderLeft:'3px solid #0d9488', paddingLeft:20 }}>
                    <p style={{ fontSize:'0.88rem', color:'rgba(255,255,255,0.3)', lineHeight:1.7, fontStyle:'italic' }}>&quot;We&apos;re building the health platform we wish our families had.&quot;</p>
                    <p style={{ fontSize:'0.78rem', color:'#0d9488', fontWeight:600, marginTop:8 }}>— Carevie Team, Mumbai</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mission-right mission-pillars stagger-group" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:2 }}>
              {[
                { num:'01', title:'Clarity',   sub:'Understand your health',    text:'AI turns medical reports and prescriptions into plain language — no jargon, no confusion.', accent:'#0d9488' },
                { num:'02', title:'Readiness', sub:'Prepared for emergencies',   text:'Your profile is always ready to share. One tap reaches your Care Circle and emergency services.', accent:'#14b8a6' },
                { num:'03', title:'Together',  sub:'One account, whole family',  text:'Manage profiles for children, elderly parents, and yourself — all from a single Carevie account.', accent:'#5eead4' },
              ].map(({ num, title, sub, text, accent }, i) => (
                <div key={num} className="stagger-item mission-card-hover" style={{ padding:'36px 32px', borderTop:`3px solid ${accent}`, background: i===1 ? 'rgba(13,148,136,0.06)' : 'transparent' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                    <span style={{ fontFamily:"'Playfair Display', serif", fontSize:'2.4rem', fontWeight:900, color:accent, opacity:0.2, lineHeight:1 }}>{num}</span>
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
              <FeaturesHeading>Everything Carevie does for you</FeaturesHeading>
            </div>

            {/* GROUP 1 */}
            <div className="reveal-section" style={{ marginBottom:48 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
                <div style={{ height:1, flex:1, background:'linear-gradient(90deg,#0d9488,transparent)' }} />
                <p style={{ fontSize:'0.7rem', fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:'#0d9488', whiteSpace:'nowrap' }}>Smart Health Management</p>
                <div style={{ height:1, flex:1, background:'linear-gradient(270deg,#0d9488,transparent)' }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }} className="feat-3col stagger-group">
                {[
                  { emoji:'📅', tag:'Appointments', title:'Appointment Tracking', bullets:['View all upcoming appointments','Get reminders before each visit'] },
                  { emoji:'💊', tag:'Medications', title:'Medication Management', bullets:['Set daily dose reminders','Track all ongoing medications','Get alerted when a course ends'] },
                  { emoji:'🚨', tag:'Emergency SOS', title:'Emergency SOS', bullets:['Save emergency contacts','One tap sends your medical profile to contacts & services'] },
                ].map(({ emoji, tag, title, bullets }) => (
                  <div key={title} className="stagger-item card-hover-lift" style={{ borderRadius:20, overflow:'hidden', background:'white', border:'1px solid #e5e7eb', boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
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
            <div className="reveal-section" style={{ marginBottom:48 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
                <div style={{ height:1, flex:1, background:'linear-gradient(90deg,#14b8a6,transparent)' }} />
                <p style={{ fontSize:'0.7rem', fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:'#14b8a6', whiteSpace:'nowrap' }}>Medical Records & AI</p>
                <div style={{ height:1, flex:1, background:'linear-gradient(270deg,#14b8a6,transparent)' }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }} className="feat-2col stagger-group">
                {[
                  { emoji:'🗂️', tag:'Medical Vault', title:'Medical Vault', dark:true,
                    bullets:['Store lab reports, prescriptions, insurance & bills','Organised by category — access anything instantly','Your full history, always available'] },
                  { emoji:'📄', tag:'AI Summarizer', title:'AI Summarizer', dark:true,
                    bullets:['Upload a document — get an instant plain-language summary','See key highlights and trends','Understand complex reports without medical expertise'] },
                ].map(({ emoji, tag, title, dark, bullets }) => (
                  <div key={title} className="stagger-item card-hover-lift" style={{ borderRadius:20, overflow:'hidden',
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
            <div className="reveal-section" style={{ marginBottom:48 }}>
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
                    <span style={{ color:'#5eead4', fontWeight:600 }}>💡 Tip: </span>If the family member has their own phone number, create a separate Carevie account for them instead.
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {[
                    { icon:'➕', text:'Create profiles for family members' },
                    { icon:'🔄', text:'Switch between profiles in one tap' },
                    { icon:'📋', text:'Manage their appointments, medications & documents separately' },
                  ].map(({ icon, text }) => (
                    <div key={text} className="mission-card-hover" style={{ display:'flex', gap:12, alignItems:'center', padding:'12px 16px', borderRadius:12, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}>
                      <span style={{ fontSize:'1rem', flexShrink:0 }}>{icon}</span>
                      <p style={{ fontSize:'0.84rem', color:'rgba(255,255,255,0.6)', lineHeight:1.5, margin:0 }}>{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* GROUP 4 */}
            <div className="reveal-section">
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
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', background:'white' }} className="feat-carecircle-grid stagger-group">
                  <div className="stagger-item" style={{ padding:'28px 32px', borderRight:'1px solid #f3f4f6' }}>
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
                  <div className="stagger-item" style={{ padding:'28px 32px' }}>
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
            <div className="hidden md:grid stagger-group" style={{ gridTemplateColumns:'2fr 1fr 1fr', gap:48, marginBottom:48 }}>
              <div className="stagger-item">
                <div style={{ marginBottom:16 }}>
                  <BrandLogo width={196} surface="dark" />
                </div>
                <p style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.9rem', lineHeight:1.7, maxWidth:260 }}>Healthcare, beautifully reimagined. Your health. Your family. Your control.</p>
              </div>
              <div className="stagger-item">
                <h4 style={{ fontSize:'0.8rem', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(255,255,255,0.4)', marginBottom:16 }}>Contact Us</h4>
                <div style={{ color:'rgba(255,255,255,0.65)', fontSize:'0.9rem', lineHeight:2 }}>
                  <p>Email : hello@carevie.com</p>
                  <p>Phone : 09511701519</p>
                  <p>Address : 327, 3rd Floor,<br />Ajmera Sikova,<br />ICRC, Ghatkopar West,<br />Mumbai 400086</p>
                </div>
              </div>
              <div className="stagger-item">
                <h4 style={{ fontSize:'0.8rem', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(255,255,255,0.4)', marginBottom:16 }}>Legal</h4>
                {legalLinks.map(([t, h]) => (
                  <Link key={t} href={h} className="footer-link-hover" style={{ display:'block', color:'rgba(255,255,255,0.65)', textDecoration:'none', fontSize:'0.9rem', marginBottom:10, transition:'color 0.2s' }}>{t}</Link>
                ))}
              </div>
            </div>

            <div className="md:hidden reveal-section">
              <div style={{ marginBottom:16 }}>
                <BrandLogo width={156} surface="dark" />
              </div>
              <div style={{ display:'flex', gap:16 }}>
                <div style={{ flex:1 }}>
                  <h3 style={{ fontWeight:600, fontSize:'0.7rem', marginBottom:4, color:'rgba(255,255,255,0.5)' }}>Contact Us</h3>
                  <div style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.7rem', lineHeight:1.9 }}>
                    <p>Email: hello@carevie.com</p><p>Phone: 09511701519</p>
                    <p>327, 3rd Floor, Ajmera Sikova, ICRC, Ghatkopar West, Mumbai 400086</p>
                  </div>
                </div>
                <div style={{ flex:1 }}>
                  <h3 style={{ fontWeight:600, fontSize:'0.7rem', marginBottom:4, color:'rgba(255,255,255,0.5)' }}>Legal</h3>
                  {legalLinks.map(([t, h]) => (
                    <Link key={t} href={h} style={{ display:'block', color:'rgba(255,255,255,0.5)', textDecoration:'none', fontSize:'0.7rem', marginBottom:6 }}>{t}</Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="hidden md:flex" style={{ borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:28, justifyContent:'space-between', alignItems:'center' }}>
              <p style={{ color:'rgba(255,255,255,0.35)', fontSize:'0.8rem' }}>© {new Date().getFullYear()} Carevie. All rights reserved.</p>
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
}
