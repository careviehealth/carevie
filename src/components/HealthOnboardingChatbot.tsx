"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/createClient";
import { useAppProfile } from "@/components/AppProfileProvider";

interface MedicationEntry {
  name: string;
  dosage: string;
  frequency: string;
}

interface PastSurgeryEntry {
  name: string;
  month: number | null; // 1-12
  year: number | null; // YYYY
}

interface Profile {
  displayName: string;
  dateOfBirth: string; // YYYY-MM-DD
  bloodGroup: string;
  heightCm: number | null;
  weightKg: number | null;

  currentDiagnosedCondition: string[];
  allergies: string[];
  ongoingTreatments: string[];
  currentMedication: MedicationEntry[];

  previousDiagnosedConditions: string[];
  pastSurgeries: PastSurgeryEntry[];
  childhoodIllness: string[];
  longTermTreatments: string[];
}

interface Message {
  id: string;
  role: "bot" | "user";
  text: string;
}

type InputType = "text" | "single-select" | "date" | "multi-text" | "multi-medication" | "multi-surgery";

interface QuestionConfig {
  key: keyof Profile;
  question: string;
  inputType: InputType;
  options?: string[];
  placeholder?: string;
  required?: boolean; // first 4 required
}

const QUESTIONS: QuestionConfig[] = [
  { key: "displayName", question: "What should we call you?", inputType: "text", required: true, placeholder: "Eg:John Doe" },
  { key: "dateOfBirth", question: "What is your date of birth?", inputType: "date", required: true },
  {
    key: "bloodGroup",
    question: "What is your blood group?",
    inputType: "single-select",
    required: true,
    options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"],
  },
  { key: "heightCm", question: "What is your height (in cm)?", inputType: "text", required: true, placeholder: "e.g., 175" },
  { key: "weightKg", question: "What is your weight (in kg)?", inputType: "text", required: true, placeholder: "e.g., 83" },
  { key: "currentDiagnosedCondition", question: "Current diagnosed condition (if any)?", inputType: "multi-text", placeholder: "e.g., Asthma / Diabetes" },
  { key: "allergies", question: "Allergies (if any)?", inputType: "multi-text", placeholder: "e.g., Penicillin / Peanuts" },
  { key: "ongoingTreatments", question: "Ongoing treatments (if any)?", inputType: "multi-text", placeholder: "e.g., Physiotherapy" },
  { key: "currentMedication", question: "Current medication (if any)?", inputType: "multi-medication" },
  { key: "previousDiagnosedConditions", question: "Previous diagnosed conditions?", inputType: "multi-text", placeholder: "e.g., Past hypertension" },
  { key: "pastSurgeries", question: "Past surgeries?", inputType: "multi-surgery" },
  { key: "childhoodIllness", question: "Childhood illnesses?", inputType: "multi-text", placeholder: "e.g., Chickenpox" },
  { key: "longTermTreatments", question: "Long-term treatments (if any)?", inputType: "multi-text", placeholder: "e.g., Thyroid medication" },
];

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function HealthOnboardingChatbot() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedProfile, selectProfile, refreshProfiles } = useAppProfile();
  const [step, setStep] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [dobParts, setDobParts] = useState({ day: "", month: "", year: "" });

  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isCancellingProfile, setIsCancellingProfile] = useState(false);

  const newProfileId = searchParams.get("newProfileId")?.trim() || "";
  const previousProfileId = searchParams.get("previousProfileId")?.trim() || "";
  const returnToRaw = searchParams.get("returnTo")?.trim() || "/app/homepage";
  const returnTo = returnToRaw.startsWith("/app/") ? returnToRaw : "/app/homepage";
  const isNewProfileOnboarding = Boolean(newProfileId);

  const [profile, setProfile] = useState<Profile>({
    displayName: "",
    dateOfBirth: "",
    bloodGroup: "",
    heightCm: null,
    weightKg: null,

    currentDiagnosedCondition: [],
    allergies: [],
    ongoingTreatments: [],
    currentMedication: [],

    previousDiagnosedConditions: [],
    pastSurgeries: [],
    childhoodIllness: [],
    longTermTreatments: [],
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const botTimeoutRef = useRef<number | null>(null);
  const currentYear = new Date().getFullYear();
  const dobYearOptions = Array.from({ length: currentYear - 1899 }, (_, idx) => currentYear - idx);
  const monthOptions = [
    { value: 1, label: "January" },
    { value: 2, label: "February" },
    { value: 3, label: "March" },
    { value: 4, label: "April" },
    { value: 5, label: "May" },
    { value: 6, label: "June" },
    { value: 7, label: "July" },
    { value: 8, label: "August" },
    { value: 9, label: "September" },
    { value: 10, label: "October" },
    { value: 11, label: "November" },
    { value: 12, label: "December" },
  ];
  const yearOptions = Array.from({ length: currentYear - 1899 }, (_, idx) => currentYear - idx);

  const addMessage = (role: "bot" | "user", text: string) => {
    setMessages((prev) => [...prev, { id: uid(), role, text }]);
  };

  useEffect(() => {
    if (messages.length === 0) addMessage("bot", QUESTIONS[0].question);
    return () => {
      if (botTimeoutRef.current) window.clearTimeout(botTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!profile.dateOfBirth) return;
    const [year, month, day] = profile.dateOfBirth.split("-");
    if (!year || !month || !day) return;
    setDobParts({ year, month, day });
  }, [profile.dateOfBirth]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!isNewProfileOnboarding || !newProfileId) return;
    if (selectedProfile?.id === newProfileId) return;

    let isCancelled = false;

    const ensureNewProfileSelected = async () => {
      try {
        await refreshProfiles();
        if (isCancelled) return;
        await selectProfile(newProfileId);
      } catch {
        // Save flow still targets newProfileId directly.
      }
    };

    void ensureNewProfileSelected();

    return () => {
      isCancelled = true;
    };
  }, [isNewProfileOnboarding, newProfileId, refreshProfiles, selectProfile, selectedProfile?.id]);

  const currentQ = QUESTIONS[step];
  const canSkip = step >= 4;
  const isRequired = !!currentQ.required;
  const dobDaysInMonth =
    dobParts.year && dobParts.month
      ? new Date(Number(dobParts.year), Number(dobParts.month), 0).getDate()
      : 31;
  const dobDayOptions = Array.from({ length: dobDaysInMonth }, (_, idx) => String(idx + 1).padStart(2, "0"));

  useEffect(() => {
    if (!dobParts.day) return;
    if (Number(dobParts.day) <= dobDaysInMonth) return;
    const next = { ...dobParts, day: "" };
    setDobParts(next);
    setAnswerOnProfile("dateOfBirth", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dobDaysInMonth]);

  useEffect(() => {
    if (currentQ.inputType === "multi-text") {
      const key = currentQ.key as keyof Profile;
      const values = profile[key] as string[];
      if (values.length === 0) {
        setProfile((prev) => ({ ...prev, [key]: [""] } as Profile));
      }
    }
    if (currentQ.inputType === "multi-medication" && profile.currentMedication.length === 0) {
      setProfile((prev) => ({ ...prev, currentMedication: [{ name: "", dosage: "", frequency: "" }] }));
    }
    if (currentQ.inputType === "multi-surgery" && profile.pastSurgeries.length === 0) {
      setProfile((prev) => ({ ...prev, pastSurgeries: [{ name: "", month: null, year: null }] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const setAnswerOnProfile = (key: keyof Profile, raw: string) => {
    const trimmed = raw.trim();
    let value: string | number | null = trimmed;

    if (key === "heightCm" || key === "weightKg") {
      const n = Number(trimmed);
      value = Number.isFinite(n) ? n : null;
    }

    if (trimmed.toLowerCase() === "skip") {
      value = key === "heightCm" || key === "weightKg" ? null : "";
    }

    const next: Profile = { ...profile, [key]: value } as Profile;
    setProfile(next);
    return next;
  };

  const validateRequired = (key: keyof Profile, raw: string) => {
    const trimmed = raw.trim();
    if (!isRequired) return true;

    if (key === "dateOfBirth") return !!trimmed;
    if (key === "bloodGroup") return !!trimmed;

    if (key === "heightCm" || key === "weightKg") {
      const n = Number(trimmed);
      return Number.isFinite(n) && n > 0;
    }
    return trimmed.length > 0;
  };

  const advanceStep = (userText: string) => {
    addMessage("user", userText.trim() ? userText : "Skipped");

    const nextStep = step + 1;
    if (nextStep < QUESTIONS.length) {
      setStep(nextStep);
      setInputValue("");
      botTimeoutRef.current = window.setTimeout(() => addMessage("bot", QUESTIONS[nextStep].question), 320);
    } else {
      setIsComplete(true);
      botTimeoutRef.current = window.setTimeout(() => addMessage("bot", "✅ Done. Press Save to store your profile."), 320);
    }
  };

  const handleSingleNext = (answer: string) => {
    if (!validateRequired(currentQ.key, answer)) {
      addMessage("bot", "⚠️ This field is required. Please enter a valid answer to continue.");
      return;
    }

    setAnswerOnProfile(currentQ.key, answer);
    advanceStep(answer.trim() ? answer : "Skipped");
  };

  const sanitizeTextList = (values: string[]) => values.map((v) => v.trim()).filter(Boolean);

  const handleMultiTextNext = (key: keyof Profile) => {
    const raw = profile[key] as string[];
    const cleaned = sanitizeTextList(raw);
    setProfile((prev) => ({ ...prev, [key]: cleaned } as Profile));
    advanceStep(cleaned.length ? cleaned.join(", ") : "None");
  };

  const formatMedicationSummary = (items: MedicationEntry[]) =>
    items.map((item) => [item.name, item.dosage, item.frequency].filter(Boolean).join(" - ")).join(", ");

  const handleMedicationNext = () => {
    const normalized = profile.currentMedication
      .map((item) => ({
        name: item.name.trim(),
        dosage: item.dosage.trim(),
        frequency: item.frequency.trim(),
      }))
      .filter((item) => item.name || item.dosage || item.frequency);

    if (!normalized.length) {
      setProfile((prev) => ({ ...prev, currentMedication: [] }));
      advanceStep("None");
      return;
    }

    const hasIncomplete = normalized.some(
      (item) => !item.name || !item.dosage || !item.frequency
    );
    if (hasIncomplete) {
      addMessage("bot", "⚠️ Please enter name, dosage, and frequency for each medication.");
      return;
    }

    setProfile((prev) => ({ ...prev, currentMedication: normalized }));
    advanceStep(formatMedicationSummary(normalized));
  };

  const handleSurgeryNext = () => {
    const cleaned = profile.pastSurgeries.map((item) => ({
      name: item.name.trim(),
      month: item.month,
      year: item.year,
    }));

    const hasInvalid = cleaned.some((item) => {
      if (!item.name) return false;
      if (!item.month || !item.year) return true;
      if (item.month < 1 || item.month > 12) return true;
      if (item.year < 1900 || item.year > new Date().getFullYear() + 1) return true;
      return false;
    });

    if (hasInvalid) {
      addMessage("bot", "⚠️ Please enter a valid month and year for each surgery before continuing.");
      return;
    }

    const normalized = cleaned.filter((item) => item.name && item.month && item.year) as PastSurgeryEntry[];
    setProfile((prev) => ({ ...prev, pastSurgeries: normalized }));
    const summary = normalized.length
      ? normalized.map((item) => `${item.name} (${item.month}/${item.year})`).join(", ")
      : "None";
    advanceStep(summary);
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRequired && !inputValue.trim()) {
      addMessage("bot", "⚠️ This field is required. Please enter a valid answer to continue.");
      return;
    }
    if (!inputValue.trim() && !canSkip) return;
    handleSingleNext(inputValue);
  };

  const handleSkip = () => {
    if (currentQ.inputType === "multi-text") {
      setProfile((prev) => ({ ...prev, [currentQ.key]: [] } as Profile));
      advanceStep("Skipped");
      return;
    }
    if (currentQ.inputType === "multi-medication") {
      setProfile((prev) => ({ ...prev, currentMedication: [] }));
      advanceStep("Skipped");
      return;
    }
    if (currentQ.inputType === "multi-surgery") {
      setProfile((prev) => ({ ...prev, pastSurgeries: [] }));
      advanceStep("Skipped");
      return;
    }
    handleSingleNext("Skip");
  };

  const progressPercent = Math.min(100, Math.round((step / QUESTIONS.length) * 100));

  const handleDiscardNewProfile = async () => {
    if (!isNewProfileOnboarding || !newProfileId) {
      router.push(returnTo);
      return;
    }

    const confirmed = window.confirm("If you go back, this new profile will not be created. Continue?");
    if (!confirmed) {
      return;
    }

    try {
      setIsCancellingProfile(true);
      setSaveError(null);

      const { error: deleteError } = await supabase
        .from("profiles")
        .delete()
        .eq("id", newProfileId);

      if (deleteError) {
        throw new Error(deleteError.message || "Unable to remove this new profile.");
      }

      await refreshProfiles();

      if (previousProfileId) {
        try {
          await selectProfile(previousProfileId);
        } catch {
          // If previous profile no longer exists, provider fallback selection is used.
        }
      }

      router.push(returnTo);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unable to go back right now.";
      setSaveError(message);
    } finally {
      setIsCancellingProfile(false);
    }
  };

  const saveToDatabase = async () => {
    try {
      setIsSaving(true);
      setSaveError(null);

      const targetProfileId =
        (isNewProfileOnboarding && newProfileId) || selectedProfile?.id || "";

      if (!targetProfileId) {
        throw new Error("Please select a profile before saving.");
      }

      const normalizedProfile: Profile = {
        ...profile,
        currentDiagnosedCondition: sanitizeTextList(profile.currentDiagnosedCondition),
        allergies: sanitizeTextList(profile.allergies),
        ongoingTreatments: sanitizeTextList(profile.ongoingTreatments),
        currentMedication: profile.currentMedication
          .map((item) => ({
            name: item.name.trim(),
            dosage: item.dosage.trim(),
            frequency: item.frequency.trim(),
          }))
          .filter((item) => item.name && item.dosage && item.frequency),
        previousDiagnosedConditions: sanitizeTextList(profile.previousDiagnosedConditions),
        pastSurgeries: profile.pastSurgeries.filter((item) => item.name && item.month && item.year),
        childhoodIllness: sanitizeTextList(profile.childhoodIllness),
        longTermTreatments: sanitizeTextList(profile.longTermTreatments),
      };

      const { displayName, ...healthPayload } = normalizedProfile;
      const res = await fetch("/api/health-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: targetProfileId,
          ...healthPayload,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to save");
      }

      if (displayName.trim()) {
        const { error } = await supabase
          .from("profiles")
          .update({ display_name: displayName.trim() })
          .eq("id", targetProfileId);
        if (error) {
          throw new Error(error.message);
        }
      }

      setIsSaved(true);
      addMessage("bot", "💾 Saved successfully!");
      window.setTimeout(() => {
        router.push("/app/homepage");
      }, 500);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Something went wrong";
      setSaveError(message);
      addMessage("bot", "❌ Couldn’t save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
  <div style={styles.pageWrap}>
    {/* FULL PAGE BACKGROUND (below navbar) */}
    <div style={styles.fullBg} />
    <div style={styles.noiseOverlay} />

        <div style={styles.header}>
          <div>
            <div style={styles.kicker}>Health Setup</div>
            <h1 style={styles.title}>Welcome, let’s build your profile.</h1>
            <p style={styles.subtitle}>This helps G1 organize your medical history securely.</p>
          </div>
          <div style={styles.headerActions}>
            {isNewProfileOnboarding && !isSaved && (
              <button
                type="button"
                onClick={handleDiscardNewProfile}
                disabled={isCancellingProfile}
                style={{
                  ...styles.goBackButton,
                  ...(isCancellingProfile ? styles.goBackButtonDisabled : {}),
                }}
              >
                {isCancellingProfile ? "Discarding..." : "Go Back"}
              </button>
            )}
            <span style={styles.badge}>{isSaved ? "Saved" : isComplete ? "Review" : "In Progress"}</span>
          </div>
        </div>

        <div style={styles.gridLayout}>
          {/* CHAT */}
          <div style={{ ...styles.liquidCard, ...styles.chatPanel }}>
            <div style={styles.specular} />
            <div style={styles.innerRim} />

            <div style={styles.chatHeader}>
              <div style={styles.chatHeaderLeft}>
                <div style={styles.dot} />
                <div style={styles.chatHeaderTitle}>Assistant</div>
              </div>
              <div style={styles.chatHeaderRight}>Secure • Private</div>
            </div>

            <div style={styles.chatWindow} ref={scrollRef}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    ...styles.messageBubble,
                    ...(msg.role === "user" ? styles.userBubble : styles.botBubble),
                  }}
                >
                  <div style={styles.bubbleMeta}>{msg.role === "user" ? "You" : "G1"}</div>
                  <div>{msg.text}</div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT */}
          <div style={styles.rightPanel}>
            <div style={styles.liquidCard}>
              <div style={styles.specular} />
              <div style={styles.innerRim} />

              <div style={styles.sectionTitle}>Progress</div>
              <div style={styles.progressRow}>
                <div style={styles.progressBarBg}>
                  <div style={{ ...styles.progressBarFill, width: `${progressPercent}%` }} />
                </div>
                <div style={styles.progressPct}>{progressPercent}%</div>
              </div>
              <div style={styles.progressText}>
                Step {Math.min(step + 1, QUESTIONS.length)} of {QUESTIONS.length}
              </div>
            </div>

            {!isComplete && (
              <div style={styles.liquidCard}>
                <div style={styles.specular} />
                <div style={styles.innerRim} />

                <div style={styles.sectionTitle}>
                  Your details {isRequired ? <span style={{ opacity: 0.75 }}>(Required)</span> : null}
                </div>

                <div style={styles.questionText}>{currentQ.question}</div>

                {currentQ.inputType === "date" && (
                  <div style={styles.inputRow}>
                    <select
                      style={styles.input}
                      value={dobParts.month}
                      onWheel={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const month = e.target.value;
                        const next = { ...dobParts, month };
                        setDobParts(next);
                        if (next.day && next.month && next.year) {
                          setAnswerOnProfile("dateOfBirth", `${next.year}-${next.month}-${next.day}`);
                        } else {
                          setAnswerOnProfile("dateOfBirth", "");
                        }
                      }}
                    >
                      <option value="">Month</option>
                      {monthOptions.map((opt) => (
                        <option key={opt.value} value={String(opt.value).padStart(2, "0")}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <select
                      style={styles.input}
                      value={dobParts.day}
                      onWheel={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const day = e.target.value;
                        const next = { ...dobParts, day };
                        setDobParts(next);
                        if (next.day && next.month && next.year) {
                          setAnswerOnProfile("dateOfBirth", `${next.year}-${next.month}-${next.day}`);
                        } else {
                          setAnswerOnProfile("dateOfBirth", "");
                        }
                      }}
                    >
                      <option value="">Day</option>
                      {dobDayOptions.map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                    <select
                      style={styles.input}
                      value={dobParts.year}
                      onWheel={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const year = e.target.value;
                        const next = { ...dobParts, year };
                        setDobParts(next);
                        if (next.day && next.month && next.year) {
                          setAnswerOnProfile("dateOfBirth", `${next.year}-${next.month}-${next.day}`);
                        } else {
                          setAnswerOnProfile("dateOfBirth", "");
                        }
                      }}
                    >
                      <option value="">Year</option>
                      {dobYearOptions.map((year) => (
                        <option key={year} value={String(year)}>
                          {year}
                        </option>
                      ))}
                    </select>

                    <button type="button" style={styles.sendButton} onClick={() => handleSingleNext(profile.dateOfBirth)}>
                      ➤
                    </button>
                  </div>
                )}

                {currentQ.inputType === "text" && (
                  <>
                    <div style={styles.helperText}>
                      {currentQ.required ? "This field is mandatory." : "Optional — you can skip if it doesn’t apply."}
                    </div>

                    <form onSubmit={handleTextSubmit} style={styles.inputRow}>
                      <input
                        style={styles.input}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={currentQ.placeholder || "Type here..."}
                        autoFocus
                      />
                      <button type="submit" style={styles.sendButton}>
                        ➤
                      </button>
                    </form>
                  </>
                )}

                {currentQ.inputType === "single-select" && (
                  <div style={styles.quickRepliesGrid}>
                    {currentQ.options?.map((opt) => (
                      <button key={opt} onClick={() => handleSingleNext(opt)} style={styles.chipBtn}>
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {currentQ.inputType === "multi-text" && (
                  <>
                    <div style={styles.helperText}>Optional — you can leave any field blank if it doesn’t apply.</div>
                    {(profile[currentQ.key] as string[]).map((value, index) => (
                      <div key={`${currentQ.key}-${index}`} style={styles.inputRow}>
                        <input
                          style={styles.input}
                          value={value}
                          onChange={(e) => {
                            const next = [...(profile[currentQ.key] as string[])];
                            next[index] = e.target.value;
                            setProfile((prev) => ({ ...prev, [currentQ.key]: next } as Profile));
                          }}
                          placeholder={currentQ.placeholder || "Type here..."}
                        />
                        {index > 0 && (
                          <button
                            type="button"
                            style={styles.removeBtn}
                            onClick={() => {
                              const next = [...(profile[currentQ.key] as string[])];
                              next.splice(index, 1);
                              setProfile((prev) => ({ ...prev, [currentQ.key]: next } as Profile));
                            }}
                          >
                            X
                          </button>
                        )}
                      </div>
                    ))}

                    <div style={styles.multiActions}>
                      <button
                        type="button"
                        style={styles.addRowBtn}
                        onClick={() => {
                          const list = profile[currentQ.key] as string[];
                          if (!list[list.length - 1]?.trim()) {
                            addMessage("bot", "⚠️ Please fill the current field before adding another.");
                            return;
                          }
                          setProfile((prev) => ({ ...prev, [currentQ.key]: [...list, ""] } as Profile));
                        }}
                      >
                        + Add another
                      </button>
                      <button type="button" style={styles.sendButton} onClick={() => handleMultiTextNext(currentQ.key)}>
                        ➤
                      </button>
                    </div>
                  </>
                )}

                {currentQ.inputType === "multi-medication" && (
                  <>
                    <div style={styles.helperText}>Add dosage and frequency if available. Medication name is required.</div>
                    {profile.currentMedication.map((item, index) => (
                      <div key={`med-${index}`} style={styles.multiGroup}>
                        <div style={styles.multiLabel}>Medication {index + 1}</div>
                        <div style={styles.inputRow}>
                          <input
                            style={styles.input}
                            value={item.name}
                            onChange={(e) => {
                              const next = [...profile.currentMedication];
                              next[index] = { ...next[index], name: e.target.value };
                              setProfile((prev) => ({ ...prev, currentMedication: next }));
                            }}
                            placeholder="Medication name"
                          />
                          {index > 0 && (
                            <button
                              type="button"
                              style={styles.removeBtn}
                              onClick={() => {
                                const next = [...profile.currentMedication];
                                next.splice(index, 1);
                                setProfile((prev) => ({ ...prev, currentMedication: next }));
                              }}
                            >
                              X
                            </button>
                          )}
                        </div>
                        <div style={styles.inputRow}>
                          <input
                            style={styles.input}
                            value={item.dosage}
                            onChange={(e) => {
                              const next = [...profile.currentMedication];
                              next[index] = { ...next[index], dosage: e.target.value };
                              setProfile((prev) => ({ ...prev, currentMedication: next }));
                            }}
                            placeholder="Dosage (optional)"
                          />
                        </div>
                        <div style={styles.inputRow}>
                          <input
                            style={styles.input}
                            value={item.frequency}
                            onChange={(e) => {
                              const next = [...profile.currentMedication];
                              next[index] = { ...next[index], frequency: e.target.value };
                              setProfile((prev) => ({ ...prev, currentMedication: next }));
                            }}
                            placeholder="Frequency (optional)"
                          />
                        </div>
                      </div>
                    ))}

                    <div style={styles.multiActions}>
                      <button
                        type="button"
                        style={styles.addRowBtn}
                        onClick={() => {
                          const last = profile.currentMedication[profile.currentMedication.length - 1];
                          if (!last?.name.trim()) {
                            addMessage("bot", "⚠️ Please enter a medication name before adding another.");
                            return;
                          }
                          setProfile((prev) => ({
                            ...prev,
                            currentMedication: [...prev.currentMedication, { name: "", dosage: "", frequency: "" }],
                          }));
                        }}
                      >
                        + Add another
                      </button>
                      <button type="button" style={styles.sendButton} onClick={handleMedicationNext}>
                        ➤
                      </button>
                    </div>
                  </>
                )}

                {currentQ.inputType === "multi-surgery" && (
                  <>
                    <div style={styles.helperText}>Include month and year for each surgery.</div>
                    {profile.pastSurgeries.map((item, index) => (
                      <div key={`surg-${index}`} style={styles.multiGroup}>
                        <div style={styles.multiLabel}>Surgery {index + 1}</div>
                        <div style={styles.inputRow}>
                          <input
                            style={styles.input}
                            value={item.name}
                            onChange={(e) => {
                              const next = [...profile.pastSurgeries];
                              next[index] = { ...next[index], name: e.target.value };
                              setProfile((prev) => ({ ...prev, pastSurgeries: next }));
                            }}
                            placeholder="Surgery name"
                          />
                          {index > 0 && (
                            <button
                              type="button"
                              style={styles.removeBtn}
                              onClick={() => {
                                const next = [...profile.pastSurgeries];
                                next.splice(index, 1);
                                setProfile((prev) => ({ ...prev, pastSurgeries: next }));
                              }}
                            >
                              X
                            </button>
                          )}
                        </div>
                        <div style={styles.inputRow}>
                          <select
                            style={styles.input}
                            value={item.month ?? ""}
                            onWheel={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const month = e.target.value ? Number(e.target.value) : null;
                              const next = [...profile.pastSurgeries];
                              next[index] = { ...next[index], month };
                              setProfile((prev) => ({ ...prev, pastSurgeries: next }));
                            }}
                          >
                            <option value="">Month</option>
                            {monthOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <select
                            style={styles.input}
                            value={item.year ?? ""}
                            onWheel={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const year = e.target.value ? Number(e.target.value) : null;
                              const next = [...profile.pastSurgeries];
                              next[index] = { ...next[index], year };
                              setProfile((prev) => ({ ...prev, pastSurgeries: next }));
                            }}
                          >
                            <option value="">Year</option>
                            {yearOptions.map((year) => (
                              <option key={year} value={year}>
                                {year}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}

                    <div style={styles.multiActions}>
                      <button
                        type="button"
                        style={styles.addRowBtn}
                        onClick={() => {
                          const last = profile.pastSurgeries[profile.pastSurgeries.length - 1];
                          if (!last?.name.trim() || !last?.month || !last?.year) {
                            addMessage("bot", "⚠️ Please complete the current surgery before adding another.");
                            return;
                          }
                          setProfile((prev) => ({
                            ...prev,
                            pastSurgeries: [...prev.pastSurgeries, { name: "", month: null, year: null }],
                          }));
                        }}
                      >
                        + Add another
                      </button>
                      <button type="button" style={styles.sendButton} onClick={handleSurgeryNext}>
                        ➤
                      </button>
                    </div>
                  </>
                )}

                {canSkip && (
                  <button onClick={handleSkip} style={styles.skipBtn}>
                    Skip for now
                  </button>
                )}
              </div>
            )}

            {isComplete && (
              <div style={styles.liquidCard}>
                <div style={styles.specular} />
                <div style={styles.innerRim} />

                <div style={styles.sectionTitle}>Save</div>

                <pre style={styles.codeBlock}>{JSON.stringify(profile, null, 2)}</pre>

                {saveError && <div style={styles.errorText}>{saveError}</div>}

                <button
                  onClick={saveToDatabase}
                  style={{ ...styles.actionButton, opacity: isSaving ? 0.7 : 1 }}
                  disabled={isSaving || isSaved}
                >
                  {isSaved ? "Saved ✅" : isSaving ? "Saving..." : "Save Profile"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    
  );
}

/**
 * Contained “liquid glass” section
 * (doesn't touch your AppLayout)
 * Mint/green palette matching your Welcome gradient:
 *  - #7FCCA3
 *  - #9AC996
 *  - #B8DDC2
 */
const styles: Record<string, React.CSSProperties> = {
  pageWrap: {
    position: "relative",
    minHeight: "100vh",
    padding: "12px 16px 28px",
    overflow: "hidden",
  },

  section: {
    position: "relative",
    maxWidth: 1120,
    margin: "0 auto",
    borderRadius: 20,
    overflow: "hidden",
    padding: "20px 18px 18px",
  },

  fullBg: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    background:
      "radial-gradient(1200px 600px at 10% 0%, rgba(127, 204, 163, 0.25), transparent 55%)," +
      "radial-gradient(900px 520px at 95% 12%, rgba(184, 221, 194, 0.35), transparent 60%)," +
      "radial-gradient(700px 450px at 50% 100%, rgba(154, 201, 150, 0.22), transparent 60%)," +
      "#f7faf9",
  },


  sectionBg: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(1100px 520px at 10% 0%, rgba(127, 204, 163, 0.20), transparent 60%)," +
      "radial-gradient(900px 520px at 92% 10%, rgba(184, 221, 194, 0.16), transparent 60%)," +
      "radial-gradient(700px 420px at 40% 115%, rgba(154, 201, 150, 0.12), transparent 60%)," +
      "rgba(5, 8, 16, 0.72)",
    border: "1px solid rgba(255,255,255,0.06)",
  },

  noiseOverlay: {
    pointerEvents: "none",
    position: "absolute",
    inset: 0,
    zIndex: 1,
    opacity: 0.04,
    mixBlendMode: "soft-light",
    backgroundImage:
      "repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, rgba(0,0,0,0.00) 2px, rgba(0,0,0,0.00) 4px)," +
      "repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, rgba(0,0,0,0.00) 2px, rgba(0,0,0,0.00) 6px)",
    filter: "blur(0.2px)",
  },

  header: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    padding: "6px 10px 10px",
  },

  kicker: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(15, 118, 110, 0.85)",
    marginBottom: 8,
  },

  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 950,
    letterSpacing: -0.4,
    backgroundImage: "linear-gradient(90deg, #7FCCA3, #9AC996, #B8DDC2)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  },

  subtitle: {
    margin: "8px 0 0",
    maxWidth: 560,
    fontSize: 13,
    color: "#475569",
    lineHeight: 1.55,
  },

  badge: {
    whiteSpace: "nowrap",
    background: "rgba(20, 184, 166, 0.12)",
    border: "1px solid rgba(15, 118, 110, 0.22)",
    color: "#0f766e",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    backdropFilter: "blur(18px) saturate(1.4)",
    WebkitBackdropFilter: "blur(18px) saturate(1.4)",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },

  goBackButton: {
    border: "1px solid rgba(15, 118, 110, 0.35)",
    background: "rgba(255,255,255,0.7)",
    color: "#0f766e",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  goBackButtonDisabled: {
    opacity: 0.7,
    cursor: "not-allowed",
  },

  gridLayout: {
    position: "relative",
    zIndex: 2,
    display: "grid",
    gridTemplateColumns: "1.15fr 0.85fr",
    gap: 14,
    padding: "0 10px 10px",
  },

  liquidCard: {
    position: "relative",
    borderRadius: 18,
    padding: 14,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.75))," +
      "radial-gradient(120% 140% at 10% 0%, rgba(255,255,255,0.95), rgba(255,255,255,0.00) 56%)," +
      "radial-gradient(120% 140% at 95% 10%, rgba(127,204,163,0.18), rgba(255,255,255,0.00) 58%)," +
      "radial-gradient(120% 140% at 40% 120%, rgba(154,201,150,0.18), rgba(255,255,255,0.00) 58%)",
    border: "1px solid rgba(15, 118, 110, 0.12)",
    boxShadow: "0 20px 60px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255,255,255,0.7)",
    backdropFilter: "blur(22px) saturate(1.6)",
    WebkitBackdropFilter: "blur(22px) saturate(1.6)",
    overflow: "hidden",
  },

  specular: {
    pointerEvents: "none",
    position: "absolute",
    inset: "-40% -30%",
    background:
      "radial-gradient(closest-side at 30% 30%, rgba(255,255,255,0.45), rgba(255,255,255,0.00) 60%)," +
      "linear-gradient(115deg, rgba(255,255,255,0.00) 35%, rgba(255,255,255,0.3) 45%, rgba(255,255,255,0.00) 55%)",
    transform: "rotate(-10deg)",
    opacity: 0.7,
    filter: "blur(6px)",
  },

  innerRim: {
    pointerEvents: "none",
    position: "absolute",
    inset: 0,
    borderRadius: 18,
    boxShadow: "inset 0 0 0 1px rgba(15, 118, 110, 0.08), inset 0 -12px 20px rgba(15, 23, 42, 0.06)",
  },

  chatPanel: { display: "flex", flexDirection: "column", height: 560, padding: 0 },

  chatHeader: {
    padding: "14px 16px",
    borderBottom: "1px solid rgba(15, 118, 110, 0.12)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    position: "relative",
    zIndex: 2,
  },
  chatHeaderLeft: { display: "flex", alignItems: "center", gap: 10 },
  chatHeaderRight: { fontSize: 12, color: "#64748b" },

  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "rgba(127, 204, 163, 0.95)",
    boxShadow: "0 0 0 5px rgba(127, 204, 163, 0.2)",
  },

  chatHeaderTitle: {
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: 1.0,
    textTransform: "uppercase",
    color: "#0f172a",
  },

  chatWindow: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 16,
    position: "relative",
    zIndex: 2,
  },

  messageBubble: {
    padding: "10px 12px",
    borderRadius: 14,
    maxWidth: "84%",
    fontSize: 14,
    lineHeight: 1.45,
    border: "1px solid transparent",
  },

  botBubble: {
    alignSelf: "flex-start",
    background: "rgba(15, 23, 42, 0.04)",
    borderColor: "rgba(15, 118, 110, 0.12)",
    color: "#0f172a",
  },

  userBubble: {
    alignSelf: "flex-end",
    background: "linear-gradient(135deg, rgba(127,204,163,0.92), rgba(154,201,150,0.76))",
    borderColor: "rgba(15, 118, 110, 0.18)",
    color: "#0f172a",
  },

  bubbleMeta: {
    fontSize: 11,
    opacity: 0.7,
    marginBottom: 4,
    fontWeight: 850,
  },

  rightPanel: { display: "flex", flexDirection: "column", gap: 12 },

  sectionTitle: {
    position: "relative",
    zIndex: 2,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#0f766e",
    fontWeight: 900,
    marginBottom: 10,
  },

  progressRow: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    gap: 10,
  },

  progressPct: {
    fontSize: 12,
    fontWeight: 900,
    color: "#0f172a",
    minWidth: 40,
    textAlign: "right",
  },

  progressBarBg: {
    flex: 1,
    height: 10,
    backgroundColor: "rgba(15, 118, 110, 0.12)",
    borderRadius: 999,
    overflow: "hidden",
    border: "1px solid rgba(15, 118, 110, 0.18)",
  },

  progressBarFill: {
    height: "100%",
    background: "linear-gradient(90deg, rgba(127,204,163,0.95), rgba(154,201,150,0.85), rgba(184,221,194,0.95))",
    transition: "width 0.35s ease",
  },

  progressText: {
    position: "relative",
    zIndex: 2,
    marginTop: 8,
    fontSize: 12,
    color: "#64748b",
    textAlign: "right",
  },

  questionText: {
    position: "relative",
    zIndex: 2,
    fontSize: 15,
    fontWeight: 850,
    marginBottom: 12,
    color: "#0f172a",
  },

  helperText: {
    position: "relative",
    zIndex: 2,
    fontSize: 12,
    color: "#64748b",
    marginTop: -6,
    marginBottom: 12,
  },

  inputRow: { position: "relative", zIndex: 2, display: "flex", gap: 10, alignItems: "center" },

  input: {
    flex: 1,
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(15, 118, 110, 0.18)",
    background: "rgba(255,255,255,0.92)",
    color: "#0f172a",
    outline: "none",
    fontSize: 14,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
  },

  sendButton: {
    height: 44,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid rgba(15, 118, 110, 0.2)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.4), rgba(255,255,255,0.05))," +
      "linear-gradient(135deg, #14b8a6, #0f766e)",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: 16,
    fontWeight: 900,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.12)",
  },

  quickRepliesGrid: { position: "relative", zIndex: 2, display: "flex", flexWrap: "wrap", gap: 8 },

  chipBtn: {
    padding: "9px 12px",
    background: "rgba(15, 118, 110, 0.08)",
    border: "1px solid rgba(15, 118, 110, 0.2)",
    borderRadius: 999,
    cursor: "pointer",
    fontSize: 13,
    color: "#0f172a",
  },

  skipBtn: {
    position: "relative",
    zIndex: 2,
    marginTop: 10,
    width: "100%",
    padding: "10px 12px",
    background: "rgba(15, 118, 110, 0.06)",
    border: "1px dashed rgba(15, 118, 110, 0.25)",
    borderRadius: 12,
    cursor: "pointer",
    color: "#0f172a",
    fontWeight: 850,
  },

  multiActions: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 12,
  },

  addRowBtn: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px dashed rgba(15, 118, 110, 0.25)",
    background: "rgba(15, 118, 110, 0.06)",
    color: "#0f172a",
    fontWeight: 850,
    cursor: "pointer",
  },

  removeBtn: {
    height: 44,
    minWidth: 44,
    borderRadius: 12,
    border: "1px solid rgba(15, 118, 110, 0.2)",
    background: "rgba(15, 118, 110, 0.08)",
    color: "#0f172a",
    cursor: "pointer",
    fontWeight: 900,
  },

  multiGroup: {
    position: "relative",
    zIndex: 2,
    borderRadius: 14,
    padding: 12,
    border: "1px solid rgba(15, 118, 110, 0.12)",
    background: "rgba(255,255,255,0.8)",
    marginBottom: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  multiLabel: {
    fontSize: 11,
    letterSpacing: 1.0,
    textTransform: "uppercase",
    color: "#0f766e",
    fontWeight: 800,
  },

  actionButton: {
    position: "relative",
    zIndex: 2,
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(15, 118, 110, 0.22)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0.05))," +
      "linear-gradient(90deg, #14b8a6, #0f766e, #0ea5a4)",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: 950,
    letterSpacing: 0.4,
    boxShadow: "0 14px 36px rgba(15, 23, 42, 0.16)",
    marginTop: 12,
  },

  codeBlock: {
    position: "relative",
    zIndex: 2,
    backgroundColor: "rgba(15, 23, 42, 0.04)",
    color: "#0f172a",
    padding: 12,
    borderRadius: 12,
    fontSize: 12,
    overflowX: "auto",
    margin: 0,
    border: "1px solid rgba(15, 118, 110, 0.12)",
  },

  errorText: {
    marginTop: 10,
    color: "salmon",
    fontSize: 13,
    fontWeight: 700,
  },
};
