"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { backendApiUrl } from "@/lib/backend-api";
import type { OnboardingAnswers } from "@/lib/user-types";

const VISUAL_LANGUAGE = [
    { value: "minimalist_monochromatic", label: "Minimalist & Monochromatic" },
    { value: "raw_industrial_brutalist", label: "Raw, Industrial & Brutalist" },
    { value: "avant_garde_dramatic", label: "Avant-Garde & Dramatic" },
    { value: "classic_high_fashion", label: "Classic High-Fashion" },
];

const IDENTITIES = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "non_binary", label: "Non-binary" },
    { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const MAJOR_BUYS = [
    { value: "tshirts", label: "T-shirts / Shirts" },
    { value: "jackets_outerwear", label: "Jackets & Outerwear" },
    { value: "jeans_trousers", label: "Jeans / Trousers" },
];

const SEASONAL = [
    { value: "summer_breathable_linen", label: "Summer / Breathable Linen" },
    { value: "tech_wear", label: "Tech-wear" },
    { value: "winter_heavy_layering", label: "Winter / Heavy Layering" },
    { value: "sharp_overcoats", label: "Sharp Overcoats" },
];

const TSHIRT_FIT = [
    { value: "oversized", label: "Oversized" },
    { value: "relaxed", label: "Relaxed" },
    { value: "slim_fit", label: "Slim Fit" },
];

const JEANS_FIT = [
    { value: "oversized_baggy", label: "Oversized / Baggy" },
    { value: "relaxed_straight", label: "Relaxed / Straight" },
    { value: "slim_tapered", label: "Slim / Tapered" },
];

const COLOR_FAMILIES = [
    { value: "neutrals_concrete_sand", label: "Neutrals (Concrete, Sand)" },
    { value: "voids_black_charcoal", label: "Voids (Black, Charcoal)" },
    { value: "earth_olive_rust", label: "Earth (Olive, Rust)" },
    { value: "vibrants_neons", label: "Vibrants (Neons)" },
];

const ACTIVITIES = [
    { value: "strength_training", label: "Strength Training" },
    { value: "football_basketball", label: "Football / Basketball" },
    { value: "yoga_running", label: "Yoga / Running" },
    { value: "creative_photography", label: "Creative / Photography" },
];

const FIT_FRUSTRATIONS = [
    { value: "shoulder_pinch", label: "The Shoulder Pinch" },
    { value: "tent_effect", label: "Tent Effect" },
    { value: "arm_bicep_trap", label: "Arm / Bicep Trap" },
    { value: "quad_struggle", label: "Quad Struggle" },
    { value: "torso_crop", label: "Torso Crop" },
    { value: "waist_gap", label: "Waist Gap" },
    { value: "bust_fit_tension", label: "Bust Fit Tension" },
    { value: "hip_constraint", label: "Hip Constraint" },
    { value: "rise_struggle", label: "Rise Struggle" },
    { value: "petite_tall_sleeve", label: "Petite / Tall Sleeve" },
];

const INITIAL_FORM: OnboardingAnswers = {
    first_name: "",
    last_name: "",
    username: "",
    age: null,
    sex: "",
    visual_language: "",
    occupation: "",
    height_cm: null,
    shoulder_width_cm: null,
    chest_bust_cm: null,
    arm_length_cm: null,
    waist_cm: null,
    thigh_cm: null,
    inseam_cm: null,
    major_buys: [],
    seasonal_preferences: [],
    tshirt_fit: "",
    jeans_fit: "",
    color_families: [],
    activity_profiles: [],
    fit_frustrations: [],
};

export default function OnboardingPage() {
    const router = useRouter();
    const { isLoaded, isSignedIn, getToken } = useAuth();
    const { user } = useUser();

    const [step, setStep] = useState(1);
    const [form, setForm] = useState<OnboardingAnswers>(INITIAL_FORM);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            router.replace("/sign-in");
            return;
        }

        const bootstrap = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = await getToken();
                if (!token) throw new Error("No auth token found");

                const bootstrapResponse = await fetch(backendApiUrl("/api/users/bootstrap"), {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        first_name: user?.firstName ?? "",
                        last_name: user?.lastName ?? "",
                        username: user?.username ?? user?.primaryEmailAddress?.emailAddress?.split("@")[0] ?? "",
                        email_id: user?.primaryEmailAddress?.emailAddress ?? "",
                    }),
                });

                const bootstrapPayload = await bootstrapResponse.json().catch(() => null);
                if (!bootstrapResponse.ok) {
                    if (bootstrapPayload?.code === "provision_failed") {
                        router.replace("/sign-up");
                        return;
                    }
                    throw new Error(bootstrapPayload?.error || "Failed to initialize user profile");
                }

                const appUser = bootstrapPayload?.user;
                const isComplete = appUser?.onboarding_completed === true;
                const isSkipped = appUser?.onboarding_skipped === true;
                if (isComplete || isSkipped) {
                    router.replace("/gallery");
                    return;
                }

                setForm((prev) => ({
                    ...prev,
                    first_name: appUser?.first_name ?? prev.first_name,
                    last_name: appUser?.last_name ?? prev.last_name,
                    username: appUser?.username ?? prev.username,
                    age: appUser?.age ?? prev.age,
                    sex: appUser?.sex ?? prev.sex,
                    visual_language: appUser?.visual_language ?? prev.visual_language,
                    occupation: appUser?.occupation ?? prev.occupation,
                    height_cm: appUser?.height_cm ?? prev.height_cm,
                    shoulder_width_cm: appUser?.shoulder_width_cm ?? prev.shoulder_width_cm,
                    chest_bust_cm: appUser?.chest_bust_cm ?? prev.chest_bust_cm,
                    arm_length_cm: appUser?.arm_length_cm ?? prev.arm_length_cm,
                    waist_cm: appUser?.waist_cm ?? prev.waist_cm,
                    thigh_cm: appUser?.thigh_cm ?? prev.thigh_cm,
                    inseam_cm: appUser?.inseam_cm ?? prev.inseam_cm,
                    major_buys: Array.isArray(appUser?.major_buys) ? appUser.major_buys : prev.major_buys,
                    seasonal_preferences: Array.isArray(appUser?.seasonal_preferences)
                        ? appUser.seasonal_preferences
                        : prev.seasonal_preferences,
                    tshirt_fit: appUser?.tshirt_fit ?? prev.tshirt_fit,
                    jeans_fit: appUser?.jeans_fit ?? prev.jeans_fit,
                    color_families: Array.isArray(appUser?.color_families) ? appUser.color_families : prev.color_families,
                    activity_profiles: Array.isArray(appUser?.activity_profiles) ? appUser.activity_profiles : prev.activity_profiles,
                    fit_frustrations: Array.isArray(appUser?.fit_frustrations) ? appUser.fit_frustrations : prev.fit_frustrations,
                }));
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load onboarding");
            } finally {
                setLoading(false);
            }
        };

        bootstrap();
    }, [getToken, isLoaded, isSignedIn, router, user]);

    const progress = useMemo(() => Math.round((step / 4) * 100), [step]);

    const updateField = <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const toggleListValue = (key: keyof OnboardingAnswers, value: string) => {
        setForm((prev) => {
            const list = Array.isArray(prev[key]) ? (prev[key] as string[]) : [];
            return {
                ...prev,
                [key]: list.includes(value) ? list.filter((item) => item !== value) : [...list, value],
            };
        });
    };

    const parseNumberInput = (raw: string): number | null => {
        const trimmed = raw.trim();
        if (!trimmed) return null;
        const value = Number(trimmed);
        return Number.isFinite(value) ? value : null;
    };

    const hasRequiredBasics = useMemo(() => {
        const hasFirstName = form.first_name.trim().length > 0;
        const hasLastName = form.last_name.trim().length > 0;
        const hasUsername = form.username.trim().length > 0;
        const hasValidAge = typeof form.age === "number" && Number.isFinite(form.age) && form.age >= 10 && form.age <= 120;
        return hasFirstName && hasLastName && hasUsername && hasValidAge;
    }, [form.age, form.first_name, form.last_name, form.username]);

    const requiredBasicsError = "First name, last name, username, and age (10-120) are required.";

    const goToNextStep = () => {
        if (step === 1 && !hasRequiredBasics) {
            setError(requiredBasicsError);
            return;
        }
        setError(null);
        setStep((prev) => Math.min(4, prev + 1));
    };

    const submit = async (skip: boolean) => {
        if (!skip && !hasRequiredBasics) {
            setError(requiredBasicsError);
            setStep(1);
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const token = await getToken();
            if (!token) throw new Error("No auth token found");

            const payload = skip
                ? { skip: true }
                : {
                      skip: false,
                      ...form,
                  };

            const response = await fetch(backendApiUrl("/api/users/onboarding"), {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.error || "Failed to save onboarding");
            }

            router.push("/gallery");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save onboarding");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <main className="mx-auto max-w-5xl px-4 py-12">
                <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-8 text-sm text-zinc-400">
                    Preparing your onboarding experience...
                </div>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-5xl px-4 py-10">
            <div className="mb-6 rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/80">Onboarding</p>
                <h1 className="mt-2 text-3xl font-semibold text-zinc-100">Set your fashion preferences</h1>
                <p className="mt-2 text-sm text-zinc-400">
                    We use these answers to personalize your marketplace, try-on flow, and pose-transfer experience.
                </p>
                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all" style={{ width: `${progress}%` }} />
                </div>
            </div>

            {error && (
                <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {error}
                </div>
            )}

            <section className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
                {step === 1 && (
                    <div className="space-y-6">
                        <h2 className="text-xl font-semibold text-zinc-100">Step 1: Basics + visual identity</h2>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Input label="First name" required value={form.first_name} onChange={(v) => updateField("first_name", v)} />
                            <Input label="Last name" required value={form.last_name} onChange={(v) => updateField("last_name", v)} />
                            <Input label="Username" required value={form.username} onChange={(v) => updateField("username", v)} />
                            <Input
                                label="Age"
                                type="number"
                                required
                                min={10}
                                max={120}
                                value={form.age == null ? "" : String(form.age)}
                                onChange={(v) => updateField("age", parseNumberInput(v))}
                            />
                        </div>
                        <RadioGroup
                            title="How would you describe your visual language?"
                            value={form.visual_language}
                            options={VISUAL_LANGUAGE}
                            onChange={(value) => updateField("visual_language", value)}
                        />
                        <RadioGroup
                            title="How do you identify?"
                            value={form.sex}
                            options={IDENTITIES}
                            onChange={(value) => updateField("sex", value)}
                        />
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-6">
                        <h2 className="text-xl font-semibold text-zinc-100">Step 2: Occupation + measurements</h2>
                        <Input label="Occupation" value={form.occupation} onChange={(v) => updateField("occupation", v)} />
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Input type="number" label="Height (cm)" value={valueOf(form.height_cm)} onChange={(v) => updateField("height_cm", parseNumberInput(v))} />
                            <Input type="number" label="Shoulder width (cm)" value={valueOf(form.shoulder_width_cm)} onChange={(v) => updateField("shoulder_width_cm", parseNumberInput(v))} />
                            <Input type="number" label="Chest/Bust (cm)" value={valueOf(form.chest_bust_cm)} onChange={(v) => updateField("chest_bust_cm", parseNumberInput(v))} />
                            <Input type="number" label="Arm length (cm)" value={valueOf(form.arm_length_cm)} onChange={(v) => updateField("arm_length_cm", parseNumberInput(v))} />
                            <Input type="number" label="Waist (cm)" value={valueOf(form.waist_cm)} onChange={(v) => updateField("waist_cm", parseNumberInput(v))} />
                            <Input type="number" label="Thigh (cm)" value={valueOf(form.thigh_cm)} onChange={(v) => updateField("thigh_cm", parseNumberInput(v))} />
                            <Input type="number" label="Inseam (cm)" value={valueOf(form.inseam_cm)} onChange={(v) => updateField("inseam_cm", parseNumberInput(v))} />
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-6">
                        <h2 className="text-xl font-semibold text-zinc-100">Step 3: Style preferences</h2>
                        <CheckboxGroup
                            title="What are your major buys?"
                            selected={form.major_buys}
                            options={MAJOR_BUYS}
                            onToggle={(value) => toggleListValue("major_buys", value)}
                        />
                        <CheckboxGroup
                            title="Seasonal preferences"
                            selected={form.seasonal_preferences}
                            options={SEASONAL}
                            onToggle={(value) => toggleListValue("seasonal_preferences", value)}
                        />
                        <RadioGroup
                            title="Go-to T-shirt fit"
                            value={form.tshirt_fit}
                            options={TSHIRT_FIT}
                            onChange={(value) => updateField("tshirt_fit", value)}
                        />
                        <RadioGroup
                            title="Go-to jeans fit"
                            value={form.jeans_fit}
                            options={JEANS_FIT}
                            onChange={(value) => updateField("jeans_fit", value)}
                        />
                        <CheckboxGroup
                            title="Color families"
                            selected={form.color_families}
                            options={COLOR_FAMILIES}
                            onToggle={(value) => toggleListValue("color_families", value)}
                        />
                        <CheckboxGroup
                            title="Activities"
                            selected={form.activity_profiles}
                            options={ACTIVITIES}
                            onToggle={(value) => toggleListValue("activity_profiles", value)}
                        />
                    </div>
                )}

                {step === 4 && (
                    <div className="space-y-6">
                        <h2 className="text-xl font-semibold text-zinc-100">Step 4: Fit frustrations + review</h2>
                        <CheckboxGroup
                            title="Do you identify with any fit frustrations?"
                            selected={form.fit_frustrations}
                            options={FIT_FRUSTRATIONS}
                            onToggle={(value) => toggleListValue("fit_frustrations", value)}
                        />
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-300">
                            <p className="font-semibold text-zinc-100">Review</p>
                            <p className="mt-1">{form.first_name} {form.last_name} ({form.username})</p>
                            <p className="mt-1 text-zinc-400">{form.visual_language || "No visual language selected"}</p>
                        </div>
                    </div>
                )}

                <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={() => submit(true)}
                        disabled={saving}
                        className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-50"
                    >
                        Skip for now
                    </button>

                    <div className="flex items-center gap-2">
                        {step > 1 && (
                            <button
                                type="button"
                                onClick={() => setStep((prev) => Math.max(1, prev - 1))}
                                disabled={saving}
                                className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-50"
                            >
                                Back
                            </button>
                        )}
                        {step < 4 ? (
                            <button
                                type="button"
                                onClick={goToNextStep}
                                disabled={saving}
                                className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
                            >
                                Next
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => submit(false)}
                                disabled={saving}
                                className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
                            >
                                {saving ? "Saving..." : "Save preferences"}
                            </button>
                        )}
                    </div>
                </div>
            </section>
        </main>
    );
}

function valueOf(value: number | null): string {
    return value == null ? "" : String(value);
}

function Input({
    label,
    value,
    onChange,
    type = "text",
    required = false,
    min,
    max,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    type?: string;
    required?: boolean;
    min?: number;
    max?: number;
}) {
    return (
        <label className="block space-y-1 text-sm">
            <span className="text-zinc-300">{label}</span>
            <input
                type={type}
                required={required}
                min={min}
                max={max}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none transition-colors focus:border-amber-400/70"
            />
        </label>
    );
}

function RadioGroup({
    title,
    value,
    options,
    onChange,
}: {
    title: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
}) {
    return (
        <div>
            <p className="mb-2 text-sm font-medium text-zinc-200">{title}</p>
            <div className="grid gap-2 sm:grid-cols-2">
                {options.map((option) => (
                    <button
                        type="button"
                        key={option.value}
                        onClick={() => onChange(option.value)}
                        className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                            value === option.value
                                ? "border-amber-400/70 bg-amber-500/10 text-amber-200"
                                : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-600"
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function CheckboxGroup({
    title,
    selected,
    options,
    onToggle,
}: {
    title: string;
    selected: string[];
    options: Array<{ value: string; label: string }>;
    onToggle: (value: string) => void;
}) {
    return (
        <div>
            <p className="mb-2 text-sm font-medium text-zinc-200">{title}</p>
            <div className="grid gap-2 sm:grid-cols-2">
                {options.map((option) => {
                    const active = selected.includes(option.value);
                    return (
                        <button
                            type="button"
                            key={option.value}
                            onClick={() => onToggle(option.value)}
                            className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                                active
                                    ? "border-amber-400/70 bg-amber-500/10 text-amber-200"
                                    : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-600"
                            }`}
                        >
                            {option.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
