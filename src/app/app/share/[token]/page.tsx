'use client';

import { useState, useEffect, use, useCallback } from 'react';

type SurgeryEntry =
  | string
  | { name?: string; year?: number | string; month?: string; notes?: string;[key: string]: unknown };

type MedicalEntry = string | { name?: string;[key: string]: unknown };

interface Medication {
  name: string;
  frequency: string;
  purpose: string;
  dosage: string;
  startDate: string;
  endDate: string;
}

interface MedicalDocument {
  name: string;
  url: string;
}

interface Appointment {
  doctor: string;
  date: string;
  time: string;
  type: string;
}

interface Doctor {
  name: string;
  specialty?: string;
  phone?: string;
}

interface ApiData {
  summary_pending?: boolean;
  insurance_pending?: boolean;
  profile: {
    name: string;
    age: number | string;
    phone: string;
    blood: string;
    height: string;
    weight: string;
    gender: string;
  };
  emergency_contact: {
    name: string;
    phone: string;
    relation: string;
  }[];
  current_medical_status: {
    allergies: string[];
    current_diagnosed_condition: string[];
    ongoing_treatments: string[];
    long_term_treatments: string[];
    medications: Medication[];
  };
  past_medical_history: {
    previous_diagnosed_conditions: MedicalEntry[];
    childhood_illness: MedicalEntry[];
    past_surgeries: SurgeryEntry[];
    family_history: MedicalEntry[];
  };
  doctors: Doctor[];
  appointments: Appointment[];
  prescriptions: string[];
  medical_documents: MedicalDocument[];
  insurance_documents: MedicalDocument[];
  insurance?: {
    policy_overview: {
      insurer_name: string;
      policy_number: string;
      plan_name: string;
      policy_type: string;
      policy_holder_name: string;
      insured_members: string[];
      status: string;
      start_date: string;
      end_date: string;
    };
    coverage_details: {
      total_sum_insured: number;
      remaining_coverage: number;
      coverage_used: number;
      room_rent_limit: string;
      icu_coverage: string;
      pre_post_hospitalization: string;
      day_care_procedures: boolean;
    };
    medical_rules: {
      pre_existing_waiting_period: string;
      specific_disease_waiting: string;
      maternity_waiting_period: string;
      covered_conditions: string[];
      excluded_conditions: string[];
    };
    hospital_access: {
      cashless_available: boolean;
      tpa_name: string;
      tpa_helpline: string;
    };
  };
  summary?: string;
}

type TabKey =
  | 'summary'
  | 'medications'
  | 'history'
  | 'surgeries'
  | 'reports'
  | 'insurance'
  | 'doctors'
  | 'appointments';

const MORE_TABS: { key: TabKey; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'medications', label: 'Medications' },
  { key: 'history', label: 'Past History' },
  { key: 'surgeries', label: 'Surgeries' },
  { key: 'reports', label: 'Reports' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'doctors', label: 'Doctors' },
  { key: 'appointments', label: 'Appointments' },
];

const TAB_LIMITS: Record<TabKey, number | null> = {
  summary: null,
  medications: 2,
  history: 3,
  surgeries: 2,
  reports: 2,
  insurance: null,
  doctors: 2,
  appointments: 2,
};

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export default function EmergencyMedicalCard({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<ApiData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [insuranceLoading, setInsuranceLoading] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  // ─── FULL PDF Export (Restored Layout & Complete Data) ─────────────────────
  const generatePDF = useCallback(async () => {
    if (!data || pdfGenerating) return;
    setPdfGenerating(true);
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      // ── Palette ──
      const G = [26, 158, 92] as [number, number, number];
      const DK = [15, 46, 30] as [number, number, number];
      const GR = [110, 110, 110] as [number, number, number];
      const LG = [247, 253, 249] as [number, number, number];
      const WH = [255, 255, 255] as [number, number, number];

      const PW = 210;
      const M = 16;
      const CW = PW - M * 2;
      let y = 0;

      // ── Helpers ──
      const san = (s: string | number | null | undefined): string => {
        if (s == null || s === "") return '\u2014';
        return String(s)
          .replace(/\u20B9/g, 'INR ')
          .replace(/\u2192/g, '->')
          .replace(/\u2190/g, '<-')
          .replace(/\u2191/g, '^')
          .replace(/\u2193/g, 'v')
          .replace(/\u00B7/g, '·')
          .replace(/[^\x00-\x7F\u00C0-\u024F·]/g, ' ')
          .replace(/  +/g, ' ')
          .trim();
      };

      const checkBreak = (need: number) => {
        if (y + need > 278) {
          doc.addPage();
          y = 18;
        }
      };

      const sectionHead = (title: string) => {
        checkBreak(14);
        doc.setFillColor(...G);
        doc.roundedRect(M, y, CW, 9, 2, 2, 'F');
        doc.setTextColor(...WH);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(title.toUpperCase(), M + 5, y + 6);
        y += 13;
        doc.setTextColor(...DK);
      };

      const catLabel = (text: string) => {
        checkBreak(9);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...GR);
        doc.text(text.toUpperCase(), M, y);
        y += 5;
        doc.setTextColor(...DK);
      };

      const bulletLine = (text: string) => {
        checkBreak(7);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...DK);
        const wrapped = doc.splitTextToSize(`\u2022  ${san(text)}`, CW - 4);
        doc.text(wrapped, M + 3, y);
        y += wrapped.length * 5.5;
      };

      const bulletLink = (name: string, url: string) => {
        checkBreak(8);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...DK);
        const safeName = san(name);
        doc.text(`\u2022  ${safeName}`, M + 3, y);
        if (url) {
          const nameW = doc.getTextWidth(`\u2022  ${safeName}`) + 4;
          const openX = M + 3 + nameW;
          doc.setTextColor(...G);
          doc.setFont('helvetica', 'bold');
          doc.textWithLink('[Open]', openX, y, { url });
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...DK);
        }
        y += 6.5;
      };

// ── PAGE 1 HEADER ──
      doc.setFillColor(...G);
      doc.rect(0, 0, PW, 30, 'F');
      doc.setTextColor(...WH);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('EMERGENCY MEDICAL CARD', M, 14);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Powered by Carevie  |  Authorised access only', M, 20);
      doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, M, 25);

      // ── LOGO ──
      try {
        const logoRes = await fetch('/carevie-logo.png');
        const logoBlob = await logoRes.blob();
        const logoBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(logoBlob);
        });
        const logoW = 36;
        const logoH = 12;
        doc.addImage(logoBase64, 'PNG', PW - M - logoW, 9, logoW, logoH);
      } catch (e) {
        console.warn('Logo not loaded', e);
      }

      y = 38;

      // ── PROFILE BLOCK (With Improved Blood Group Layout) ──
      doc.setFillColor(...LG);
      doc.roundedRect(M, y, CW, 32, 3, 3, 'F');

      doc.setTextColor(...DK);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(san(data.profile.name), M + 6, y + 10);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GR);
      const profileLine = [
        data.profile.age ? `${data.profile.age} yrs` : '',
        san(data.profile.gender),
        san(data.profile.height),
        san(data.profile.weight),
      ].filter(Boolean).join('   |   ');
      doc.text(profileLine, M + 6, y + 18);

      if (data.profile.phone) {
        doc.text(`Contact: ${san(data.profile.phone)}`, M + 6, y + 25);
      }

      // Blood group badge
      if (data.profile.blood) {
        const badgeW = 32;
        const badgeX = PW - M - badgeW - 5;
        doc.setFillColor(253, 232, 232);
        doc.roundedRect(badgeX, y + 6, badgeW, 20, 2, 2, 'F');
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(192, 57, 43);
        doc.text("BLOOD GROUP", badgeX + badgeW / 2, y + 12, { align: 'center' });
        doc.setFontSize(14);
        doc.text(san(data.profile.blood), badgeX + badgeW / 2, y + 20, { align: 'center' });
      }
      y += 38;

      // ── EMERGENCY CONTACT ──
      const primary = data.emergency_contact?.[0];
      if (primary) {
        checkBreak(25);
        doc.setFillColor(255, 248, 235);
        doc.setDrawColor(255, 230, 180);
        doc.roundedRect(M, y, CW, 20, 2, 2, 'FD');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(150, 80, 0);
        doc.text('PRIMARY EMERGENCY CONTACT', M + 5, y + 6);

        doc.setTextColor(...DK);
        doc.setFontSize(11);
        doc.text(`${san(primary.name)} (${san(primary.relation)})`, M + 5, y + 13);
        doc.setFont('helvetica', 'normal');
        doc.text(`Phone: ${san(primary.phone)}`, PW - M - 60, y + 13);
        y += 26;
      }

      // ── CRITICAL INFO (Side-by-Side) ──
      checkBreak(35);
      const halfW = (CW - 6) / 2;

      // Allergies
      doc.setFillColor(255, 242, 230);
      doc.roundedRect(M, y, halfW, 25, 2, 2, 'F');
      doc.setTextColor(180, 90, 0);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('ALLERGIES', M + 5, y + 6);
      doc.setTextColor(...DK);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const allergyText = (data.current_medical_status.allergies ?? []).map(san).join(', ') || 'None Reported';
      doc.text(doc.splitTextToSize(allergyText, halfW - 10), M + 5, y + 13);

      // Conditions
      doc.setFillColor(253, 235, 235);
      doc.roundedRect(M + halfW + 6, y, halfW, 25, 2, 2, 'F');
      doc.setTextColor(180, 40, 40);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('ACTIVE CONDITIONS', M + halfW + 11, y + 6);
      doc.setTextColor(...DK);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const condText = (data.current_medical_status.current_diagnosed_condition ?? []).map(san).join(', ') || 'No Active Conditions';
      doc.text(doc.splitTextToSize(condText, halfW - 10), M + halfW + 11, y + 13);

      y += 32;

      // ── MEDICAL SUMMARY ──
      if (data.summary) {
        sectionHead('Medical Summary');
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(44, 74, 58);
        const cleanSummary = san(data.summary);
        const summaryLines = doc.splitTextToSize(cleanSummary, CW);
        for (const line of summaryLines) {
          checkBreak(5.5);
          doc.text(line, M, y);
          y += 5.2;
        }
        y += 5;
        doc.setTextColor(...DK);
      }

      // ── MEDICATIONS & TREATMENTS ──
      const meds = data.current_medical_status.medications ?? [];
      const treatments = data.current_medical_status.ongoing_treatments ?? [];
      if (meds.length || treatments.length) {
        sectionHead('Medications & Treatments');
        if (treatments.length) {
          catLabel('Ongoing Treatments');
          treatments.forEach(t => bulletLine(t));
          y += 3;
        }
        if (meds.length) {
          catLabel('Medications');
          checkBreak(30);
          autoTable(doc, {
            startY: y,
            margin: { left: M, right: M },
            head: [['Medication', 'Dosage', 'Frequency', 'Purpose']],
            body: meds.map(m => [san(m.name), san(m.dosage), san(m.frequency), san(m.purpose)]),
            styles: { fontSize: 9, cellPadding: 3, textColor: DK, minCellHeight: 10 },
            headStyles: { fillColor: G, textColor: WH, fontStyle: 'bold', fontSize: 9 },
            alternateRowStyles: { fillColor: LG },
            columnStyles: {
              0: { cellWidth: 42, fontStyle: 'bold' },
              1: { cellWidth: 22 },
              2: { cellWidth: 55 },
            },
            theme: 'grid',
          });
          y = (doc as any).lastAutoTable.finalY + 8;
        }
      }

      // ── RESTORED: PAST HISTORY ──
      const prev = data.past_medical_history.previous_diagnosed_conditions ?? [];
      const child = data.past_medical_history.childhood_illness ?? [];
      const fam = data.past_medical_history.family_history ?? [];
      const histRows = [
        ...prev.map(h => ['Previous Condition', san(formatMedicalEntry(h))]),
        ...child.map(h => ['Childhood Illness', san(formatMedicalEntry(h))]),
        ...(() => {
          const allEntries = fam.flatMap(h => {
            if (typeof h === 'string') return [h];
            const obj = h as Record<string, unknown>;
            const inner = obj.familyMedicalHistory ?? obj.history ?? obj.entries;
            const list = Array.isArray(inner) ? inner : [obj];
            return list.map((entry: Record<string, unknown>) => {
              const relation = String(entry.relation ?? entry.member ?? entry.relative ?? '');
              const condition = String(entry.disease ?? entry.condition ?? entry.name ?? '');
              return relation && condition ? `${relation} — ${condition}` : relation || condition;
            });
          });
          return allEntries.length ? [['Family History', san(allEntries.join('\n'))]] : [];
        })(),
      ];
      if (histRows.length) {
        sectionHead('Past Medical History');
        checkBreak(30);
        autoTable(doc, {
          startY: y,
          margin: { left: M, right: M },
          head: [['Category', 'Detail']],
          body: histRows,
          styles: { fontSize: 9, cellPadding: 3, textColor: DK },
          headStyles: { fillColor: G, textColor: WH, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: LG },
          columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold' } },
          theme: 'grid',
        });
        y = (doc as any).lastAutoTable.finalY + 8;
      }

      // ── RESTORED: SURGERIES ──
      const surg = data.past_medical_history.past_surgeries ?? [];
      if (surg.length) {
        sectionHead('Surgeries');
        checkBreak(30);
        autoTable(doc, {
          startY: y,
          margin: { left: M, right: M },
          head: [['Surgery Details']],
          body: surg.map(s => [san(formatMedicalEntry(s))]),
          styles: { fontSize: 9, cellPadding: 3, textColor: DK },
          headStyles: { fillColor: G, textColor: WH, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: LG },
          theme: 'grid',
        });
        y = (doc as any).lastAutoTable.finalY + 8;
      }

      // ── RESTORED: MEDICAL TEAM ──
      const doctors = data.doctors ?? [];
      if (doctors.length) {
        sectionHead('Medical Team');
        checkBreak(30);
        autoTable(doc, {
          startY: y,
          margin: { left: M, right: M },
          head: [['Doctor', 'Specialty', 'Phone']],
          body: doctors.map(d => [san(d.name), san(d.specialty), san(d.phone)]),
          styles: { fontSize: 9, cellPadding: 3, textColor: DK },
          headStyles: { fillColor: G, textColor: WH, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: LG },
          columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold' }, 1: { cellWidth: 55 } },
          theme: 'grid',
        });
        y = (doc as any).lastAutoTable.finalY + 8;
      }

      // ── RESTORED: APPOINTMENTS ──
      const apts = data.appointments ?? [];
      if (apts.length) {
        sectionHead('Upcoming Appointments');
        checkBreak(30);
        autoTable(doc, {
          startY: y,
          margin: { left: M, right: M },
          head: [['Doctor', 'Date', 'Time', 'Type']],
          body: apts.map(a => [san(a.doctor), san(a.date), san(a.time), san(a.type)]),
          styles: { fontSize: 9, cellPadding: 3, textColor: DK },
          headStyles: { fillColor: G, textColor: WH, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: LG },
          columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold' }, 1: { cellWidth: 35 }, 2: { cellWidth: 28 } },
          theme: 'grid',
        });
        y = (doc as any).lastAutoTable.finalY + 8;
      }

      // ── RESTORED: REPORTS & PRESCRIPTIONS ──
      const medDocs = data.medical_documents ?? [];
      const rxDocs = data.prescriptions ?? [];
      if (medDocs.length || rxDocs.length) {
        sectionHead('Reports & Prescriptions');
        if (medDocs.length) {
          catLabel('Medical Documents');
          medDocs.forEach(d => bulletLink(d.name, d.url));
          y += 3;
        }
        if (rxDocs.length) {
          catLabel('Prescriptions');
          rxDocs.forEach(rx => {
            const name = typeof rx === 'string' ? rx : (rx as any).name || String(rx);
            const url = typeof rx === 'string' ? '' : (rx as any).url || '';
            bulletLink(name, url);
          });
          y += 3;
        }
        y += 2;
      }

      // ── RESTORED: INSURANCE ──
      if (data.insurance) {
        const ins = data.insurance;
        const po = ins.policy_overview;
        const cd = ins.coverage_details;
        const ha = ins.hospital_access;

        sectionHead('Insurance');
        checkBreak(30);

        const curr = (n: number) => n != null ? `INR ${n.toLocaleString('en-IN')}` : '\u2014';

        autoTable(doc, {
          startY: y,
          margin: { left: M, right: M },
          head: [['Field', 'Value']],
          body: [
            ['Insurer', san(po.insurer_name)],
            ['Policy No.', san(po.policy_number)],
            ['Plan', san(po.plan_name)],
            ['Holder', san(po.policy_holder_name)],
            ['Status', san(po.status)],
            ['Start Date', san(po.start_date)],
            ['End Date', san(po.end_date)],
            ['Sum Insured', curr(cd.total_sum_insured)],
            ['Remaining', curr(cd.remaining_coverage)],
            ['Room Rent', san(cd.room_rent_limit)],
            ['ICU Coverage', san(cd.icu_coverage)],
            ['Pre/Post Hosp.', san(cd.pre_post_hospitalization)],
            ['Cashless', ha.cashless_available ? 'Available' : 'Not Available'],
            ['TPA', san(ha.tpa_name)],
            ['TPA Helpline', san(ha.tpa_helpline)],
          ],
          styles: { fontSize: 9, cellPadding: 3, textColor: DK },
          headStyles: { fillColor: G, textColor: WH, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: LG },
          columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold' } },
          theme: 'grid',
        });
        y = (doc as any).lastAutoTable.finalY + 8;

        const insDocs = data.insurance_documents ?? [];
        if (insDocs.length) {
          catLabel('Insurance Documents');
          insDocs.forEach(d => bulletLink(d.name, d.url));
          y += 3;
        }
      }

      // ── PAGE FOOTERS ──
      const total = doc.getNumberOfPages();
      for (let pg = 1; pg <= total; pg++) {
        doc.setPage(pg);
        doc.setFillColor(245, 248, 246);
        doc.rect(0, 285, PW, 12, 'F');
        doc.setDrawColor(220, 235, 225);
        doc.line(0, 285, PW, 285);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...GR);
        doc.text(
          'Medical data is confidential  |  Authorised access only  |  Carevie',
          M, 291,
        );
        doc.text(`Page ${pg} of ${total}`, PW - M - 16, 291);
      }

      // ── SAVE ──
      const safeName = san(data.profile.name).replace(/\s+/g, '-').toLowerCase();
      doc.save(`carevie-medical-card-${safeName}.pdf`);

    } catch (err) {
      console.error('[PDF]', err);
      alert('PDF generation failed. Please try again.');
    } finally {
      setPdfGenerating(false);
    }
  }, [data, pdfGenerating]);
  // ── end generatePDF ──────────────────────────────────────────────────────────

  const handleTabChange = (key: TabKey) => {
    setActiveTab(key);
    setExpanded(false);
  };

  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/share/${token}`, {
          signal: controller.signal,
          headers: { Accept: 'text/event-stream' },
        });

        if (!response.ok) {
          throw new Error(`Connection failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('Unable to read stream');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            setLoading(false);
            setSummaryLoading(false);
            setInsuranceLoading(false);
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const lines = part.split('\n');
            let eventType = '';
            let eventData = '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                eventData = line.slice(6).trim();
              }
            }

            if (!eventData) continue;

            try {
              const parsed = JSON.parse(eventData);

              if (eventType === 'profile_data') {
                setLoading(false);
                setSummaryLoading(
                  parsed.summary_pending === true && !parsed.summary
                );
                setInsuranceLoading(
                  parsed.insurance_pending === true &&
                  !parsed.insurance?.policy_overview
                );
                setData(parsed as ApiData);
                continue;
              }

              setData((prev) => {
                if (!prev) return null;

                if (eventType === 'medical_summary') {
                  setSummaryLoading(false);
                  return { ...prev, summary: parsed.summary ?? '' };
                }

                if (eventType === 'insurance_summary') {
                  setInsuranceLoading(false);
                  return { ...prev, insurance: parsed.insurance };
                }

                if (eventType === 'error') {
                  console.error('[SSE] Backend error:', parsed.message);
                  setSummaryLoading(false);
                  setInsuranceLoading(false);
                }

                return prev;
              });

              if (eventType === 'complete') {
                setLoading(false);
                setSummaryLoading(false);
                setInsuranceLoading(false);
              }
            } catch (parseErr) {
              console.error('[SSE] Failed to parse event data:', parseErr);
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(
          err instanceof Error ? err.message : 'Something went wrong'
        );
        setLoading(false);
        setSummaryLoading(false);
        setInsuranceLoading(false);
      }
    };

    fetchData();
    return () => { controller.abort(); };
  }, [token]);

  if (loading) {
    return (
      <div style={loadStyle.center}>
        <style>{`
          @keyframes spin {
            0%   { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
        <div style={loadStyle.spinner} />
        <p style={loadStyle.text}>Loading medical card…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={loadStyle.center}>
        <p style={loadStyle.errorText}>⚠ {error ?? 'No data found'}</p>
      </div>
    );
  }

  const tabCounts: Partial<Record<TabKey, number>> = {
    medications:
      data.current_medical_status.medications?.length ?? 0,
    history:
      (data.past_medical_history.previous_diagnosed_conditions?.length ?? 0) +
      (data.past_medical_history.childhood_illness?.length ?? 0) +
      (data.past_medical_history.family_history?.length ?? 0),
    surgeries: data.past_medical_history.past_surgeries?.length ?? 0,
    reports:
      (data.medical_documents?.length ?? 0) +
      (data.prescriptions?.length ?? 0),
    doctors: data.doctors?.length ?? 0,
    appointments: data.appointments?.length ?? 0,
  };

  const primaryContact = data.emergency_contact?.[0];

  let canExpand = false;
  let footerNote = '';
  let expandButtonText = expanded ? '← Show less' : 'View full details →';

  if (activeTab === 'summary') {
    canExpand = !!data.summary && data.summary.length > 200;
    footerNote = 'Medical Summary Overview';
  } else if (activeTab === 'insurance') {
    canExpand = !!data.insurance;
    footerNote = 'Insurance & Policy Details';
  } else {
    const activeLimit = TAB_LIMITS[activeTab];
    const activeCount = tabCounts[activeTab] ?? 0;
    canExpand = activeLimit !== null && activeLimit > 0 && activeCount > activeLimit;
    const shownCount = (canExpand && !expanded) ? activeLimit : activeCount;

    footerNote = canExpand
      ? `Showing ${shownCount} of ${activeCount} record(s)`
      : activeCount > 0
        ? `${activeCount} record(s)`
        : 'Patient overview';

    if (!expanded) {
      expandButtonText = `View full details (${activeCount - (activeLimit || 0)} more) →`;
    }
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }

        @keyframes fadeInSlide {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes pulseDot {
          0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.6); }
          70% { box-shadow: 0 0 0 6px rgba(74, 222, 128, 0); }
          100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
        }

        .emc-root {
          font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
          background: #F4F7F5;
          min-height: 100vh;
          padding: 32px 24px;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          color: #0F2E1E;
        }
        
        .emc-outer {
          width: 100%;
          max-width: 1100px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .emc-header {
          background: linear-gradient(135deg, #1A9E5C 0%, #0FAEAE 100%);
          border-radius: 24px;
          padding: 28px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          box-shadow: 0 10px 30px rgba(26, 158, 92, 0.2);
        }
        .emc-header-logo { display: flex; align-items: center; }
        .logo-img { height: 44px; width: auto; object-fit: contain; }
        .emc-header-text { text-align: right; display: flex; flex-direction: column; align-items: flex-end; }
        .emc-header-title { color: #fff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; margin: 0; }
        .emc-header-sub { color: rgba(255,255,255,0.85); font-size: 14px; margin: 4px 0 0 0; font-weight: 500; }
        
        .emc-header-badge {
          display: flex; align-items: center; gap: 8px;
          background: rgba(255,255,255,0.2); color: #fff;
          font-size: 13px; font-weight: 600;
          padding: 8px 16px; border-radius: 30px; white-space: nowrap;
          backdrop-filter: blur(10px);
        }
        .status-dot {
          width: 8px; height: 8px; background: #4ADE80; border-radius: 50%;
          animation: pulseDot 2s infinite;
        }

        .emc-cols {
          display: grid;
          grid-template-columns: 360px 1fr;
          gap: 24px;
          align-items: start;
        }
        .emc-left  { display: flex; flex-direction: column; gap: 16px; }
        .emc-right { display: flex; flex-direction: column; gap: 16px; }

        .emc-card {
          background: #fff; border: none; border-radius: 20px; padding: 22px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.03), 0 1px 4px rgba(0,0,0,0.02);
        }
        
        .section-label {
          font-size: 11px; font-weight: 700; color: #6AAF8A;
          text-transform: uppercase; letter-spacing: 1.2px; margin: 0 0 14px;
        }

        .profile-row { display: flex; align-items: center; gap: 16px; }
        .avatar {
          width: 64px; height: 64px; border-radius: 50%;
          background: linear-gradient(135deg, #1A9E5C, #0FAEAE);
          display: flex; align-items: center; justify-content: center;
          font-size: 20px; font-weight: 700; color: #fff; flex-shrink: 0;
          box-shadow: 0 4px 10px rgba(26,158,92,0.3);
        }
        .profile-name { font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.3px; }
        .profile-sub  { font-size: 14px; color: #4A7A60; margin: 4px 0 8px; font-weight: 500;}
        .address-row  { display: flex; align-items: center; gap: 6px; }
        .address-text { font-size: 13px; color: #4A7A60; font-weight: 500;}

        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .info-item { display: flex; flex-direction: column; gap: 4px; }
        .info-key  { font-size: 12px; color: #6AAF8A; font-weight: 500; }
        .info-val  { font-size: 15px; font-weight: 600; }
        .info-val.blood { color: #E74C3C; }

        .contact-inner {
          display: flex; align-items: center;
          justify-content: space-between; gap: 12px;
          background: #F7FDF9; padding: 14px; border-radius: 14px; border: 1px solid #EAF5EE;
        }
        .contact-name { font-size: 16px; font-weight: 700; margin: 0; }
        .contact-sub  { font-size: 13px; color: #4A7A60; margin: 4px 0 0; font-weight: 500;}
        .call-btn {
          display: flex; align-items: center; gap: 6px;
          background: #1A9E5C; color: #fff; border-radius: 12px;
          padding: 10px 16px; font-size: 13px; font-weight: 600;
          text-decoration: none; white-space: nowrap; flex-shrink: 0;
          transition: background 0.2s, transform 0.1s;
        }
        .call-btn:hover { background: #14804A; transform: translateY(-1px); }

        .critical-block {
          border: none; border-radius: 20px;
          overflow: hidden; background: #fff;
          box-shadow: 0 4px 16px rgba(245, 166, 35, 0.1);
          border: 1px solid #FBE8D2;
        }
        .critical-header {
          background: #FFF9ED; padding: 12px 20px;
          font-size: 13px; font-weight: 700; color: #D67A00; letter-spacing: 0.5px;
          border-bottom: 1px solid #FFE9C2;
        }
        .critical-inner { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
        .critical-card {
          padding: 14px; background: #FAFAFA;
          border-radius: 14px; border: 1px solid #EBEBEB;
        }
        .critical-label-row { display: flex; align-items: center; margin-bottom: 10px; gap: 8px; }
        .critical-title { font-size: 12px; font-weight: 700; color: #333; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .tag-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .tag        { font-size: 13px; font-weight: 600; padding: 6px 12px; border-radius: 8px; }
        .tag-red    { background: #FDE8E8; color: #C0392B; }
        .tag-green  { background: #E0F5EA; color: #1A7A45; }
        .tag-orange { background: #FEF0D9; color: #D67A00; }
        .tag-blue   { background: #EAF3FF; color: #1A5FA0; }
        .empty-tags { font-size: 13px; color: #A0A0A0; font-style: italic; }

        .more-card { background: #fff; border: none; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.04); }
        .more-card-header { padding: 22px 24px 16px; }
        .more-card-title  { font-size: 18px; font-weight: 700; letter-spacing: -0.3px; }
        .more-divider     { height: 1px; background: #F0F0F0; }

        .tab-grid {
          display: grid; grid-template-columns: repeat(4, 1fr);
          gap: 10px; padding: 16px 24px; background: #FCFCFC;
        }
        .tab-btn {
          display: flex; align-items: center; justify-content: center;
          gap: 6px; padding: 12px 10px;
          border-radius: 12px; border: none;
          background: #F4F7F5; font-size: 13px; font-weight: 600; color: #5A856D;
          cursor: pointer; text-align: center;
          transition: all 0.2s ease;
        }
        .tab-btn:hover { background: #E6EFEA; color: #1A9E5C; }
        .tab-btn.active { background: #1A9E5C; color: #fff; box-shadow: 0 4px 12px rgba(26,158,92,0.3); }
        .tab-count { font-size: 11px; font-weight: 700; background: #E0F5EA; color: #1A7A45; padding: 2px 8px; border-radius: 12px; }
        .tab-count.active { background: rgba(255,255,255,0.25); color: #fff; }

        .tab-content { padding: 24px; min-height: 200px; }
        .tab-animated { animation: fadeInSlide 0.3s cubic-bezier(0.4, 0, 0.2, 1); }

        .more-card-footer { padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; background: #FCFCFC; border-top: 1px solid #F0F0F0; }
        .footer-note     { font-size: 13px; color: #8BA897; font-weight: 500; }
        .view-full-btn   { font-size: 13px; color: #1A9E5C; font-weight: 700; background: none; border: none; cursor: pointer; padding: 0; transition: color 0.2s; }
        .view-full-btn:hover { color: #14804A; }
        .view-full-btn:disabled { opacity: 0.4; cursor: default; }

        .summary-container { position: relative; }
        .summary-container.collapsed .summary-text {
          display: -webkit-box; -webkit-line-clamp: 17; -webkit-box-orient: vertical; overflow: hidden;
        }
        .summary-text { font-size: 15px; color: #2C4A3A; line-height: 1.8; margin: 0; white-space: pre-wrap; transition: all 0.3s ease; }

        .list-row  { display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #F4F7F5; }
        .list-dot  { width: 8px; height: 8px; border-radius: 50%; background: #1A9E5C; margin-right: 14px; flex-shrink: 0; }
        .list-text { font-size: 14px; color: #2C4A3A; font-weight: 500; }

        .doc-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: #F9FCFA; border-radius: 12px; margin-bottom: 8px; border: 1px solid #EAF5EE; }
        .doc-name-row  { display: flex; align-items: center; gap: 10px; flex: 1; }
        .doc-info-name { font-size: 14px; font-weight: 600; margin: 0; }
        .doc-dl { font-size: 13px; color: #1A9E5C; font-weight: 700; background: none; border: none; cursor: pointer; padding: 0; text-decoration: none; }

        .tab-sec-head { font-size: 11px; font-weight: 700; color: #6AAF8A; text-transform: uppercase; letter-spacing: 1.2px; margin: 0 0 12px; }

        .med-row {
          display: flex; align-items: flex-start; gap: 14px;
          padding: 16px; background: #fff;
          border-radius: 16px; border: 1px solid #E8F2EC; margin-bottom: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.02);
        }
        .med-icon  { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; background: #F0FAF5; border-radius: 10px; flex-shrink: 0; color: #1A9E5C; }
        .med-name  { font-size: 15px; font-weight: 700; margin: 0; }
        .med-sub   { font-size: 13px; color: #6AAF8A; margin: 4px 0 0; font-weight: 500; }
        .med-badge { font-size: 11px; font-weight: 700; background: #E0F5EA; color: #1A7A45; padding: 4px 12px; border-radius: 20px; flex-shrink: 0; }

        .ins-grid       { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .ins-status-row { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; padding: 14px; background: #FAFAFA; border-radius: 12px; border: 1px solid #F0F0F0;}
        .badge-active   { background: #E0F5EA; color: #1A7A45; font-size: 13px; font-weight: 700; padding: 6px 16px; border-radius: 20px; }
        .badge-inactive { background: #FDE8E8; color: #C0392B; font-size: 13px; font-weight: 700; padding: 6px 16px; border-radius: 20px; }
        .fade-in-section { animation: fadeInSlide 0.4s ease; margin-top: 24px; padding-top: 24px; border-top: 1px solid #F0F0F0;}

        .doctor-row {
          display: flex; align-items: center; gap: 14px;
          padding: 16px; background: #fff;
          border-radius: 16px; border: 1px solid #E8F2EC; margin-bottom: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.02);
        }
        .doctor-avatar {
          width: 44px; height: 44px; border-radius: 50%;
          background: linear-gradient(135deg, #1A9E5C, #0FAEAE);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; font-weight: 700; color: #fff; flex-shrink: 0;
        }
        .doctor-name { font-size: 15px; font-weight: 700; margin: 0; }
        .doctor-spec { font-size: 13px; color: #6AAF8A; margin: 4px 0 0; font-weight: 500;}
        .small-call-btn {
          width: 38px; height: 38px; border-radius: 50%; background: #F0FAF5;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; text-decoration: none; transition: background 0.2s;
        }
        .small-call-btn:hover { background: #1A9E5C; color: #fff; }
        .small-call-btn svg { stroke: currentColor; color: #1A9E5C; transition: color 0.2s; }
        .small-call-btn:hover svg { color: #fff; }

        .apt-row {
          display: flex; align-items: center; gap: 16px;
          padding: 16px; background: #fff;
          border-radius: 16px; border: 1px solid #E8F2EC; margin-bottom: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.02);
        }
        .apt-date-box {
          width: 54px; flex-shrink: 0;
          display: flex; flex-direction: column; align-items: center;
          background: #F0FAF5; border-radius: 12px; padding: 8px 6px;
        }
        .apt-day   { font-size: 20px; font-weight: 800; color: #1A9E5C; line-height: 1; }
        .apt-month { font-size: 10px; color: #3A8A5C; font-weight: 700; text-transform: uppercase; margin-top: 4px; }
        .apt-doctor { font-size: 15px; font-weight: 700; margin: 0; }
        .apt-meta   { font-size: 13px; color: #6AAF8A; margin: 4px 0 0; font-weight: 500;}
        .apt-badge  { font-size: 11px; font-weight: 700; background: #E0F5EA; color: #1A7A45; padding: 4px 12px; border-radius: 20px; flex-shrink: 0; }

        .empty-state { padding: 32px 24px; text-align: center; background: #FAFAFA; border-radius: 16px; border: 1px dashed #E0E0E0; }
        .empty-text  { font-size: 14px; color: #8A8A8A; margin: 0; font-weight: 500; }

        .emc-footer      { text-align: center; padding: 16px; }
        .emc-footer-text { font-size: 12px; color: #8BA897; margin: 0; font-weight: 500; }

        @media (max-width: 768px) {
          .emc-root          { padding: 16px 12px; }
          .emc-header        { flex-direction: row; justify-content: space-between; align-items: center; gap: 12px; border-radius: 20px; padding: 20px; }
          .emc-header-title { font-size: 18px; }
          .logo-img          { height: 32px; }
          .emc-cols          { grid-template-columns: 1fr; }
          .tab-grid          { grid-template-columns: repeat(2, 1fr); padding: 12px; }
          .ins-grid          { grid-template-columns: 1fr 1fr; }
          .info-grid         { grid-template-columns: 1fr 1fr; }
          .tab-content       { padding: 16px; }
        }

        .pdf-bar {
          display: flex; align-items: center; justify-content: space-between;
          background: #fff; border-radius: 16px; padding: 12px 20px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.05);
        }
        .pdf-bar-msg {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; color: #4A7A60; font-weight: 500;
        }
        .pdf-dot-spin {
          width: 10px; height: 10px; border-radius: 50%;
          border: 2px solid #C8E6D4; border-top-color: #1A9E5C;
          animation: spin 0.8s linear infinite; display: inline-block; flex-shrink: 0;
        }
        .pdf-check { color: #1A9E5C; flex-shrink: 0; }
        .pdf-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 10px 22px; border-radius: 12px; border: none;
          font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s;
          white-space: nowrap;
        }
        .pdf-btn-active {
          background: #1A9E5C; color: #fff;
          box-shadow: 0 4px 14px rgba(26,158,92,0.3);
        }
        .pdf-btn-active:hover { background: #14804A; transform: translateY(-1px); box-shadow: 0 6px 18px rgba(26,158,92,0.35); }
        .pdf-btn-wait { background: #EBF5EF; color: #6AAF8A; cursor: not-allowed; }
        .pdf-spin-white {
          width: 13px; height: 13px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff;
          animation: spin 0.7s linear infinite;
        }

        @media (max-width: 400px) {
          .tab-btn { font-size: 12px; padding: 10px 8px; }
        }
      `}</style>

      <div className="emc-root">
        <div className="emc-outer">

          {/* HEADER */}
          <div className="emc-header">
            <div className="emc-header-logo">
              <img src="/carevie-logo.png" alt="Carevie Logo" className="logo-img" />
            </div>
            <div className="emc-header-text">
              <h1 className="emc-header-title">Emergency Medical Card</h1>
              <p className="emc-header-sub">Quick access for first responders</p>
            </div>
          </div>


          {/* ── PDF Export Bar ── */}
          {(() => {
            const stillLoading = summaryLoading || insuranceLoading;
            const btnDisabled = loading || stillLoading || pdfGenerating;

            const msg = pdfGenerating
              ? 'Building PDF…'
              : stillLoading
                ? summaryLoading && insuranceLoading
                  ? 'Loading summary and insurance data…'
                  : summaryLoading
                    ? 'Loading medical summary…'
                    : 'Loading insurance data…'
                : 'All data loaded — ready to export';

            return (
              <div className="pdf-bar">
                <span className="pdf-bar-msg">
                  {btnDisabled
                    ? <span className="pdf-dot-spin" />
                    : (
                      <svg className="pdf-check" width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )
                  }
                  {msg}
                </span>

                <button
                  className={`pdf-btn ${btnDisabled ? 'pdf-btn-wait' : 'pdf-btn-active'}`}
                  onClick={generatePDF}
                  disabled={btnDisabled}
                  title={btnDisabled ? 'Wait for all data to load' : 'Download full medical card as PDF'}
                >
                  {pdfGenerating ? (
                    <><span className="pdf-spin-white" /> Generating…</>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Export as PDF
                    </>
                  )}
                </button>
              </div>
            );
          })()}

          {/* TWO COLUMNS */}
          <div className="emc-cols">

            {/* ── LEFT COLUMN ── */}
            <div className="emc-left">

              {/* Profile card */}
              <div className="emc-card">
                <div className="profile-row">
                  <div className="avatar">{getInitials(data.profile.name)}</div>
                  <div style={{ flex: 1 }}>
                    <p className="profile-name">{data.profile.name}</p>
                    <p className="profile-sub">
                      {data.profile.age} yrs · {data.profile.gender}
                      {data.profile.height ? ` · ${data.profile.height}` : ''}
                      {data.profile.weight ? ` · ${data.profile.weight}` : ''}
                    </p>
                    {data.profile.phone && (
                      <div className="address-row">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1A9E5C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.1 2.23 2 2 0 012.09.05h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.18 6.18l1.28-1.28a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                        </svg>
                        <span className="address-text">{data.profile.phone}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Personal Info */}
              <div className="emc-card">
                <p className="section-label">Personal Info</p>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-key">Age</span>
                    <span className="info-val">{data.profile.age} years</span>
                  </div>
                  <div className="info-item">
                    <span className="info-key">Blood Group</span>
                    <span className="info-val blood">{data.profile.blood || '—'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-key">Height</span>
                    <span className="info-val">{data.profile.height || '—'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-key">Weight</span>
                    <span className="info-val">{data.profile.weight || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Emergency Contact */}
              {primaryContact && (
                <div className="emc-card">
                  <p className="section-label">Emergency Contact</p>
                  <div className="contact-inner">
                    <div>
                      <p className="contact-name">{primaryContact.name}</p>
                      <p className="contact-sub">
                        {primaryContact.relation} · {primaryContact.phone}
                      </p>
                    </div>
                    <a href={`tel:${primaryContact.phone}`} className="call-btn" aria-label={`Call ${primaryContact.name}`}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.1 2.23 2 2 0 012.09.05h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.18 6.18l1.28-1.28a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                      </svg>
                      Call
                    </a>
                  </div>
                </div>
              )}

              {/* Critical — always visible */}
              <div className="critical-block">
                <div className="critical-header">⚠ Critical Info — Always Visible</div>
                <div className="critical-inner">
                  <div className="critical-card">
                    <div className="critical-label-row">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D67A00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <span className="critical-title">Allergies</span>
                    </div>
                    <div className="tag-row">
                      {(data.current_medical_status.allergies?.length ?? 0) > 0
                        ? data.current_medical_status.allergies.map((a, i) => (
                          <span key={i} className="tag tag-orange">{a}</span>
                        ))
                        : <span className="empty-tags">No known allergies</span>
                      }
                    </div>
                  </div>
                  <div className="critical-card" style={{ marginBottom: 0 }}>
                    <div className="critical-label-row">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C0392B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                      </svg>
                      <span className="critical-title">Current Medical Status</span>
                    </div>
                    <div className="tag-row">
                      {(data.current_medical_status.current_diagnosed_condition?.length ?? 0) > 0
                        ? data.current_medical_status.current_diagnosed_condition.map((s, i) => (
                          <span key={i} className="tag tag-red">{s}</span>
                        ))
                        : <span className="empty-tags">No active conditions</span>
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── RIGHT COLUMN ── */}
            <div className="emc-right">
              <div className="more-card">

                <div className="more-card-header">
                  <h2 className="more-card-title">More Details</h2>
                </div>
                <div className="more-divider" />

                {/* Tab buttons */}
                <div className="tab-grid" role="tablist">
                  {MORE_TABS.map((tab) => {
                    const count = tabCounts[tab.key];
                    const isActive = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        role="tab"
                        aria-selected={isActive}
                        className={`tab-btn${isActive ? ' active' : ''}`}
                        onClick={() => handleTabChange(tab.key)}
                      >
                        {tab.label}
                        {count !== undefined && count > 0 && (
                          <span className={`tab-count${isActive ? ' active' : ''}`}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="more-divider" />

                {/* Tab content */}
                <div className="tab-content tab-animated" key={activeTab} role="tabpanel">
                  {activeTab === 'summary' && <SummaryTab data={data} isLoading={summaryLoading} expanded={expanded} />}
                  {activeTab === 'medications' && <MedicationsTab data={data} expanded={expanded} limit={TAB_LIMITS.medications} />}
                  {activeTab === 'history' && <HistoryTab data={data} expanded={expanded} limit={TAB_LIMITS.history} />}
                  {activeTab === 'surgeries' && <SurgeriesTab data={data} expanded={expanded} limit={TAB_LIMITS.surgeries} />}
                  {activeTab === 'reports' && <ReportsTab data={data} expanded={expanded} limit={TAB_LIMITS.reports} />}
                  {activeTab === 'insurance' && <InsuranceTab data={data} isLoading={insuranceLoading} expanded={expanded} />}
                  {activeTab === 'doctors' && <DoctorsTab data={data} expanded={expanded} limit={TAB_LIMITS.doctors} />}
                  {activeTab === 'appointments' && <AppointmentsTab data={data} expanded={expanded} limit={TAB_LIMITS.appointments} />}
                </div>

                <div className="more-divider" />

                {/* Footer */}
                <div className="more-card-footer">
                  <span className="footer-note">
                    {footerNote}
                  </span>
                  {canExpand && (
                    <button
                      className="view-full-btn"
                      onClick={() => setExpanded((e) => !e)}
                      aria-expanded={expanded}
                    >
                      {expandButtonText}
                    </button>
                  )}
                </div>

              </div>
            </div>

          </div>

          <div className="emc-footer">
            <p className="emc-footer-text">
              Medical data is confidential — authorised access only
            </p>
          </div>

        </div>
      </div>
    </>
  );
}

/* ── INNER TAB COMPONENTS ── */
function InnerLoader({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: 14 }}>
      <div style={loadStyle.spinner} />
      <span style={{ fontSize: 14, color: '#6AAF8A', fontWeight: 500 }}>{text}</span>
    </div>
  );
}

function formatMedicalEntry(entry: MedicalEntry | SurgeryEntry): string {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return String(entry);
  const obj = entry as Record<string, unknown>;
  if ('name' in obj) {
    const parts: string[] = [];
    if (obj.name) parts.push(String(obj.name));
    if (obj.month) parts.push(String(obj.month));
    if (obj.year) parts.push(String(obj.year));
    if (obj.notes) parts.push(`(${obj.notes})`);
    if (parts.length) return parts.join(' ');
  }
  const deepString = (v: unknown): string => {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      return String(v);
    if (Array.isArray(v)) return v.map(deepString).filter(Boolean).join(', ');
    if (typeof v === 'object') return formatMedicalEntry(v as MedicalEntry);
    return String(v);
  };

  const values = Object.values(obj).map(deepString).filter(Boolean);
  return values.length ? values.join(' · ') : JSON.stringify(obj);
}

function SummaryTab({ data, isLoading, expanded }: { data: ApiData; isLoading: boolean; expanded: boolean }) {
  if (isLoading) return <InnerLoader text="Generating medical summary…" />;

  return data.summary ? (
    <div className={`summary-container ${!expanded ? 'collapsed' : ''}`}>
      <p className="summary-text">{data.summary}</p>
    </div>
  ) : (
    <Empty text="No summary available" />
  );
}

function MedicationsTab({ data, expanded, limit }: { data: ApiData; expanded: boolean; limit: number | null }) {
  const meds = data.current_medical_status.medications ?? [];
  const treatments = data.current_medical_status.ongoing_treatments ?? [];
  const visibleMeds = (limit !== null && !expanded) ? meds.slice(0, limit) : meds;

  if (!meds.length && !treatments.length)
    return <Empty text="No active medications recorded" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {treatments.length > 0 && (
        <>
          <p className="tab-sec-head">Ongoing Treatments</p>
          <div className="tag-row" style={{ marginBottom: 18 }}>
            {treatments.map((t, i) => (
              <span key={i} className="tag tag-blue">{t}</span>
            ))}
          </div>
        </>
      )}
      {meds.length > 0 && (
        <>
          <p className="tab-sec-head">Medications</p>
          {visibleMeds.map((m, i) => (
            <div key={i} className="med-row">
              <div className="med-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.5 20.5l10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7z" />
                  <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <p className="med-name">{m.name}{m.dosage ? ` — ${m.dosage}` : ''}</p>
                <p className="med-sub">{m.frequency}{m.purpose ? ` · ${m.purpose}` : ''}</p>
              </div>
              <span className="med-badge">Active</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function HistoryTab({ data, expanded, limit }: { data: ApiData; expanded: boolean; limit: number | null }) {
  const all = [
    ...data.past_medical_history.previous_diagnosed_conditions ?? [],
    ...data.past_medical_history.childhood_illness ?? [],
    ...data.past_medical_history.family_history ?? [],
  ];

  if (!all.length) return <Empty text="No past history recorded" />;

  const cap = (limit !== null && !expanded) ? limit : all.length;
  let rem = cap;

  const slicedPrev = (data.past_medical_history.previous_diagnosed_conditions ?? []).slice(0, rem);
  rem = Math.max(0, rem - slicedPrev.length);
  const slicedChild = (data.past_medical_history.childhood_illness ?? []).slice(0, rem);
  rem = Math.max(0, rem - slicedChild.length);
  const slicedFam = (data.past_medical_history.family_history ?? []).slice(0, rem);

  return (
    <div>
      {slicedPrev.length > 0 && (
        <>
          <p className="tab-sec-head">Previous Conditions</p>
          {slicedPrev.map((h, i) => <ListRow key={i} text={formatMedicalEntry(h)} />)}
        </>
      )}
      {slicedChild.length > 0 && (
        <>
          <p className="tab-sec-head" style={{ marginTop: 16 }}>Childhood Illness</p>
          {slicedChild.map((h, i) => <ListRow key={i} text={formatMedicalEntry(h)} />)}
        </>
      )}
      {slicedFam.length > 0 && (
        <>
          <p className="tab-sec-head" style={{ marginTop: 16 }}>Family History</p>
          {slicedFam.flatMap((h, i) => {
            if (typeof h === 'string') return [<ListRow key={i} text={h} />];
            const obj = h as Record<string, unknown>;

            // Handle {familyMedicalHistory: [...]} wrapper
            const inner = obj.familyMedicalHistory ?? obj.history ?? obj.entries;
            const list = Array.isArray(inner) ? inner : [obj];

            return list.map((entry: Record<string, unknown>, j: number) => {
              const relation = String(entry.relation ?? entry.member ?? entry.relative ?? '');
              const condition = String(entry.disease ?? entry.condition ?? entry.name ?? '');
              const text = relation && condition
                ? `${relation} — ${condition}`
                : relation || condition || JSON.stringify(entry);
              return <ListRow key={`${i}-${j}`} text={text} />;
            });
          })}
        </>
      )}
    </div>
  );
}

function SurgeriesTab({ data, expanded, limit }: { data: ApiData; expanded: boolean; limit: number | null }) {
  const surgeries = data.past_medical_history.past_surgeries ?? [];
  const visible = (limit !== null && !expanded) ? surgeries.slice(0, limit) : surgeries;

  if (!surgeries.length) return <Empty text="No surgeries recorded" />;

  return (
    <div>
      {visible.map((s, i) => <ListRow key={i} text={formatMedicalEntry(s)} />)}
    </div>
  );
}

function ReportsTab({ data, expanded, limit }: { data: ApiData; expanded: boolean; limit: number | null }) {
  const docs = data.medical_documents ?? [];
  const rxs = data.prescriptions ?? [];
  const all = [...docs, ...rxs];

  if (!all.length) return <Empty text="No reports or prescriptions found" />;

  const shouldLimit = limit !== null && !expanded;
  const cap = shouldLimit ? limit : all.length;
  const visibleDocs = docs.slice(0, cap);
  const docsShown = visibleDocs.length;
  const visibleRxs = rxs.slice(0, Math.max(0, cap - docsShown));

  return (
    <div>
      {visibleDocs.length > 0 && (
        <>
          <p className="tab-sec-head">Medical Documents</p>
          {visibleDocs.map((doc, i) => (
            <div key={i} className="doc-row">
              <div className="doc-name-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6AAF8A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <p className="doc-info-name">{doc.name}</p>
              </div>
              <a href={doc.url} target="_blank" rel="noopener noreferrer" className="doc-dl">Download</a>
            </div>
          ))}
        </>
      )}
      {visibleRxs.length > 0 && (
        <>
          <p className="tab-sec-head" style={{ marginTop: docs.length ? 18 : 0 }}>Prescriptions</p>
          {visibleRxs.map((rx, i) => (
            <div key={i} className="doc-row">
              <div className="doc-name-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6AAF8A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                </svg>
                <p className="doc-info-name">{rx}</p>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function InsuranceTab({ data, isLoading, expanded }: { data: ApiData; isLoading: boolean; expanded: boolean }) {
  if (isLoading) return <InnerLoader text="Fetching insurance records…" />;
  const ins = data.insurance;
  if (!ins) return <Empty text="No insurance information available" />;

  const { policy_overview: po, coverage_details: cd, hospital_access: ha } = ins;

  return (
    <div>
      <p className="tab-sec-head">Policy Overview</p>
      <div className="ins-grid">
        <InfoBox label="Insurer" value={po.insurer_name} />
        <InfoBox label="Policy No." value={po.policy_number} />
        <InfoBox label="Plan" value={po.plan_name} />
        <InfoBox label="Holder" value={po.policy_holder_name} />
        <InfoBox label="Start Date" value={po.start_date} />
        <InfoBox label="End Date" value={po.end_date} />
      </div>

      <div className="ins-status-row">
        <span className="info-key" style={{ fontSize: 13 }}>Policy Status</span>
        <span className={po.status?.toLowerCase() === 'active' ? 'badge-active' : 'badge-inactive'}>
          {po.status || '—'}
        </span>
      </div>

      {expanded && (
        <div className="fade-in-section">
          <p className="tab-sec-head">Coverage Details</p>
          <div className="ins-grid">
            <InfoBox label="Sum Insured" value={formatCurrency(cd.total_sum_insured)} />
            <InfoBox label="Remaining" value={formatCurrency(cd.remaining_coverage)} />
            <InfoBox label="Used" value={formatCurrency(cd.coverage_used)} />
            <InfoBox label="Room Rent" value={cd.room_rent_limit} />
            <InfoBox label="ICU Coverage" value={cd.icu_coverage} />
            <InfoBox label="Pre/Post Hosp" value={cd.pre_post_hospitalization} />
          </div>
          <p className="tab-sec-head" style={{ marginTop: 24 }}>Hospital Access</p>
          <div className="ins-grid" style={{ marginBottom: 4 }}>
            <InfoBox label="Cashless" value={ha.cashless_available ? 'Available' : 'Not Available'} />
            <InfoBox label="TPA Name" value={ha.tpa_name} />
            <InfoBox label="Helpline" value={ha.tpa_helpline} />
          </div>
        </div>
      )}
    </div>
  );
}

function DoctorsTab({ data, expanded, limit }: { data: ApiData; expanded: boolean; limit: number | null }) {
  const doctors = data.doctors ?? [];
  const visible = (limit !== null && !expanded) ? doctors.slice(0, limit) : doctors;

  if (!doctors.length) return <Empty text="No doctors added" />;

  return (
    <div>
      {visible.map((doc, i) => (
        <div key={i} className="doctor-row">
          <div className="doctor-avatar">{getInitials(doc.name)}</div>
          <div style={{ flex: 1 }}>
            <p className="doctor-name">{doc.name}</p>
            {doc.specialty && <p className="doctor-spec">{doc.specialty}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function AppointmentsTab({ data, expanded, limit }: { data: ApiData; expanded: boolean; limit: number | null }) {
  const apts = data.appointments ?? [];
  const visible = (limit !== null && !expanded) ? apts.slice(0, limit) : apts;

  if (!apts.length) return <Empty text="No upcoming appointments" />;

  return (
    <div>
      {visible.map((apt, i) => {
        const parts = apt.date?.split(' ') ?? [];
        return (
          <div key={i} className="apt-row">
            <div className="apt-date-box">
              <span className="apt-day">{parts[0] ?? ''}</span>
              <span className="apt-month">{parts.slice(1).join(' ')}</span>
            </div>
            <div style={{ flex: 1 }}>
              <p className="apt-doctor">{apt.doctor}</p>
              <p className="apt-meta">{apt.time} · {apt.type}</p>
            </div>
            <span className="apt-badge">Upcoming</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── SMALL HELPERS ── */
function ListRow({ text }: { text: string }) {
  return (
    <div className="list-row">
      <div className="list-dot" />
      <span className="list-text">{text}</span>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="info-item">
      <span className="info-key">{label}</span>
      <span className="info-val">{value || '—'}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <p className="empty-text">{text}</p>
    </div>
  );
}

const loadStyle: Record<string, React.CSSProperties> = {
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', background: '#F4F7F5', gap: 16,
  },
  spinner: {
    width: 44, height: 44, borderRadius: '50%',
    border: '4px solid #D1E5DA', borderTopColor: '#1A9E5C',
    animation: 'spin 0.8s linear infinite',
  },
  text: { fontSize: 15, color: '#4A7A60', fontWeight: 500 },
  errorText: { fontSize: 16, color: '#C0392B', fontWeight: 700 },
};