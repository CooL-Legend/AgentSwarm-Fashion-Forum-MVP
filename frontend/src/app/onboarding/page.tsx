"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { backendApiUrl } from "@/lib/backend-api";
import type {
    OnboardingOptionalFields,
    OnboardingRequiredFields,
    UserProfile,
} from "@/lib/user-types";

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
    { value: "tshirts_shirts", label: "T-shirts / Shirts" },
    { value: "jackets_outerwear", label: "Jackets & Outerwear" },
    { value: "jeans_trousers", label: "Jeans / Trousers" },
];

const SEASONAL = [
    { value: "summer_breathable", label: "Summer / Breathable" },
    { value: "summer_techwear", label: "Summer / Tech-wear" },
    { value: "winter_heavy_layering", label: "Winter / Heavy Layering" },
    { value: "winter_sharp_overcoats", label: "Winter / Sharp Overcoats" },
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
    { value: "neutrals", label: "Neutrals (Concrete, Sand)" },
    { value: "voids", label: "Voids (Black, Charcoal)" },
    { value: "earth", label: "Earth (Olive, Rust)" },
    { value: "vibrants", label: "Vibrants (Neons)" },
];

const ACTIVITIES = [
    { value: "strength_training", label: "Strength Training" },
    { value: "football_basketball", label: "Football / Basketball" },
    { value: "yoga_running", label: "Yoga / Running" },
    { value: "creative_photography", label: "Creative / Photography" },
];

const FIT_FRUSTRATIONS = [
    { value: "shoulder_pinch", label: "The Shoulder Pinch" },
    { value: "bicep_trap", label: "Bicep Trap" },
    { value: "torso_crop", label: "Torso Crop" },
    { value: "rise_struggle", label: "Rise Struggle" },
    { value: "quad_struggle", label: "Quad Struggle" },
    { value: "petite_tall_sleeve", label: "Petite / Tall Sleeve" },
    { value: "bust_gape", label: "Bust Gape" },
    { value: "waist_gap", label: "Waist Gap" },
    { value: "hip_constraint", label: "Hip Constraint" },
    { value: "tent_effect", label: "Tent Effect" },
    { value: "tall_sleeve", label: "Tall Sleeve" },
];

type Phase = 1 | 2 | 3;

const MAX_IMAGES = 5;

type ImageAsset = {
    id: string;
    signed_url: string;
    object_path: string;
    status: "uploading" | "pending" | "completed" | "failed";
};

type RequiredForm = OnboardingRequiredFields & { first_name: string; last_name: string };

const INITIAL_REQUIRED: RequiredForm = {
    username: "",
    date_of_birth: "",
    gender_identity: "",
    visual_language: "",
    first_name: "",
    last_name: "",
};

const INITIAL_OPTIONAL: OnboardingOptionalFields = {
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

async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
        reader.readAsDataURL(file);
    });
}

export default function OnboardingPage() {
    const router = useRouter();
    const { isLoaded, isSignedIn, getToken } = useAuth();
    const { user } = useUser();

    const [phase, setPhase] = useState<Phase>(1);
    const [required, setRequired] = useState<RequiredForm>(INITIAL_REQUIRED);
    const [optional, setOptional] = useState<OnboardingOptionalFields>(INITIAL_OPTIONAL);
    const [images, setImages] = useState<ImageAsset[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const authFetch = useCallback(
        async (path: string, init?: RequestInit) => {
            const token = await getToken();
            return fetch(backendApiUrl(path), {
                ...init,
                headers: {
                    ...(init?.headers ?? {}),
                    Authorization: `Bearer ${token ?? ""}`,
                },
            });
        },
        [getToken],
    );

    const loadImages = useCallback(async () => {
        const res = await authFetch("/api/images");
        if (!res.ok) return [] as ImageAsset[];
        const data = (await res.json()) as { assets?: Array<{ object_path: string; signed_url: string }> };
        const assets = (data.assets ?? [])
            .filter((a) => a.object_path.includes("/input/") || a.object_path.includes("/inputs/"))
            .map<ImageAsset>((a) => ({
                id: a.object_path,
                signed_url: a.signed_url,
                object_path: a.object_path,
                status: "completed",
            }));
        setImages((prev) => {
            // Preserve in-flight uploads that haven't landed in the list yet.
            const serverIds = new Set(assets.map((a) => a.object_path));
            const inFlight = prev.filter((a) => a.status === "uploading" && !serverIds.has(a.object_path));
            return [...assets, ...inFlight];
        });
        return assets;
    }, [authFetch]);

    // Resolve starting phase from server state on mount.
    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            router.replace("/sign-in");
            return;
        }

        (async () => {
            setLoading(true);
            try {
                // Bootstrap (idempotent) to make sure the row exists.
                await authFetch("/api/users/bootstrap", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        first_name: user?.firstName ?? null,
                        last_name: user?.lastName ?? null,
                        username: user?.username ?? null,
                        email: user?.primaryEmailAddress?.emailAddress ?? null,
                    }),
                });

                const res = await authFetch("/api/users");
                if (!res.ok) throw new Error("failed to load profile");
                const body = (await res.json()) as { user: UserProfile };
                const profile = body.user;

                if (profile.onboarding_completed) {
                    router.replace("/gallery");
                    return;
                }

                setRequired({
                    username: profile.username ?? "",
                    date_of_birth: profile.date_of_birth ?? "",
                    gender_identity: profile.gender_identity ?? "",
                    visual_language: profile.visual_language ?? "",
                    first_name: profile.first_name ?? user?.firstName ?? "",
                    last_name: profile.last_name ?? user?.lastName ?? "",
                });
                setOptional({
                    occupation: profile.occupation ?? "",
                    height_cm: profile.height_cm,
                    shoulder_width_cm: profile.shoulder_width_cm,
                    chest_bust_cm: profile.chest_bust_cm,
                    arm_length_cm: profile.arm_length_cm,
                    waist_cm: profile.waist_cm,
                    thigh_cm: profile.thigh_cm,
                    inseam_cm: profile.inseam_cm,
                    major_buys: profile.major_buys ?? [],
                    seasonal_preferences: profile.seasonal_preferences ?? [],
                    tshirt_fit: profile.tshirt_fit ?? "",
                    jeans_fit: profile.jeans_fit ?? "",
                    color_families: profile.color_families ?? [],
                    activity_profiles: profile.activity_profiles ?? [],
                    fit_frustrations: profile.fit_frustrations ?? [],
                });

                const requiredDone =
                    !!profile.username &&
                    !!profile.date_of_birth &&
                    !!profile.gender_identity &&
                    !!profile.visual_language;

                if (!requiredDone) {
                    setPhase(1);
                } else {
                    const assets = await loadImages();
                    setPhase(assets.length >= 1 ? 3 : 2);
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to load onboarding state");
            } finally {
                setLoading(false);
            }
        })();
    }, [isLoaded, isSignedIn, user, router, authFetch, loadImages]);

    // Poll /api/images while any upload is in-flight.
    useEffect(() => {
        const pending = images.some((i) => i.status === "uploading" || i.status === "pending");
        if (phase === 2 && pending) {
            pollRef.current = setInterval(() => {
                loadImages().catch(() => null);
            }, 3000);
        }
        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        };
    }, [phase, images, loadImages]);

    const submitRequired = async () => {
        setSaving(true);
        setError(null);
        try {
            const res = await authFetch("/api/users/onboarding", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phase: "required", ...required }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({ error: "failed" }));
                throw new Error(j.error ?? "failed");
            }
            setPhase(2);
            await loadImages();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    const onFiles = async (files: FileList | null) => {
        if (!files) return;
        setError(null);
        const slots = MAX_IMAGES - images.length;
        const toUpload = Array.from(files).slice(0, slots);
        for (const file of toUpload) {
            if (file.size > 5 * 1024 * 1024) {
                setError(`${file.name} exceeds the 5MB limit`);
                continue;
            }
            const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            setImages((prev) => [
                ...prev,
                { id: tempId, signed_url: "", object_path: tempId, status: "uploading" },
            ]);
            try {
                const b64 = await fileToBase64(file);
                const res = await authFetch("/api/images/upload", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ kind: "input", image: b64 }),
                });
                if (!res.ok) {
                    const j = await res.json().catch(() => ({ error: "upload failed" }));
                    throw new Error(j.error ?? "upload failed");
                }
                await loadImages();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Upload failed");
                setImages((prev) => prev.filter((i) => i.id !== tempId));
            }
        }
    };

    const advanceFromImages = async () => {
        setSaving(true);
        setError(null);
        try {
            const res = await authFetch("/api/users/onboarding", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phase: "images_done" }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({ error: "failed" }));
                throw new Error(j.error ?? "failed");
            }
            setPhase(3);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to advance");
        } finally {
            setSaving(false);
        }
    };

    const submitOptional = async (skip: boolean) => {
        setSaving(true);
        setError(null);
        try {
            const body = skip
                ? { phase: "optional_skip" }
                : { phase: "optional_save", ...optional };
            const res = await authFetch("/api/users/onboarding", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({ error: "failed" }));
                throw new Error(j.error ?? "failed");
            }
            router.replace("/gallery");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    const toggleArray = (field: keyof OnboardingOptionalFields, value: string) => {
        setOptional((prev) => {
            const current = (prev[field] as string[] | undefined) ?? [];
            const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
            return { ...prev, [field]: next };
        });
    };

    if (loading) {
        return (
            <main className="min-h-screen bg-neutral-50 flex items-center justify-center">
                <p className="text-neutral-600">Loading…</p>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-neutral-50 py-10 px-4">
            <div className="max-w-2xl mx-auto">
                <header className="mb-6">
                    <p className="text-xs uppercase tracking-wider text-neutral-500">Phase {phase} of 3</p>
                    <h1 className="text-2xl font-semibold mt-1">
                        {phase === 1 && "Tell us about you"}
                        {phase === 2 && "Upload 1–5 reference photos"}
                        {phase === 3 && "Style preferences (optional)"}
                    </h1>
                </header>

                {error && (
                    <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {phase === 1 && (
                    <section className="space-y-4 bg-white p-6 rounded-lg border border-neutral-200">
                        <Field label="Username">
                            <input
                                className="input"
                                value={required.username}
                                onChange={(e) => setRequired({ ...required, username: e.target.value })}
                            />
                        </Field>
                        <Field label="Date of birth">
                            <input
                                type="date"
                                className="input"
                                value={required.date_of_birth}
                                onChange={(e) => setRequired({ ...required, date_of_birth: e.target.value })}
                            />
                        </Field>
                        <Field label="Gender identity">
                            <RadioGroup
                                name="gender_identity"
                                options={IDENTITIES}
                                value={required.gender_identity}
                                onChange={(v) => setRequired({ ...required, gender_identity: v })}
                            />
                        </Field>
                        <Field label="Visual language">
                            <RadioGroup
                                name="visual_language"
                                options={VISUAL_LANGUAGE}
                                value={required.visual_language}
                                onChange={(v) => setRequired({ ...required, visual_language: v })}
                            />
                        </Field>
                        <div className="pt-2 flex justify-end">
                            <button
                                className="btn-primary"
                                onClick={submitRequired}
                                disabled={
                                    saving ||
                                    !required.username ||
                                    !required.date_of_birth ||
                                    !required.gender_identity ||
                                    !required.visual_language
                                }
                            >
                                Continue
                            </button>
                        </div>
                    </section>
                )}

                {phase === 2 && (
                    <section className="space-y-4 bg-white p-6 rounded-lg border border-neutral-200">
                        <p className="text-sm text-neutral-600">
                            Upload 1 to {MAX_IMAGES} reference photos. These help us match the right looks for you.
                        </p>
                        <label className="block">
                            <span className="sr-only">Upload</span>
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                multiple
                                disabled={images.length >= MAX_IMAGES}
                                onChange={(e) => onFiles(e.target.files)}
                                className="block w-full text-sm text-neutral-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-neutral-900 file:text-white hover:file:bg-neutral-700"
                            />
                        </label>

                        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                            {images.map((img) => (
                                <li key={img.id} className="aspect-square rounded-md border border-neutral-200 overflow-hidden bg-neutral-100 relative">
                                    {img.signed_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={img.signed_url} alt="upload" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-xs text-neutral-500">
                                            Uploading…
                                        </div>
                                    )}
                                    <span className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-white/80 border border-neutral-200">
                                        {img.status}
                                    </span>
                                </li>
                            ))}
                        </ul>

                        <div className="pt-2 flex justify-between items-center">
                            <p className="text-xs text-neutral-500">{images.length} / {MAX_IMAGES}</p>
                            <button
                                className="btn-primary"
                                onClick={advanceFromImages}
                                disabled={saving || images.length < 1}
                            >
                                Continue
                            </button>
                        </div>
                    </section>
                )}

                {phase === 3 && (
                    <section className="space-y-5 bg-white p-6 rounded-lg border border-neutral-200">
                        <Field label="Occupation">
                            <input
                                className="input"
                                value={optional.occupation ?? ""}
                                onChange={(e) => setOptional({ ...optional, occupation: e.target.value })}
                            />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            {(["height_cm", "shoulder_width_cm", "chest_bust_cm", "arm_length_cm", "waist_cm", "thigh_cm", "inseam_cm"] as const).map((k) => (
                                <Field key={k} label={k.replace(/_/g, " ")}>
                                    <input
                                        type="number"
                                        className="input"
                                        value={optional[k] ?? ""}
                                        onChange={(e) =>
                                            setOptional({
                                                ...optional,
                                                [k]: e.target.value === "" ? null : Number(e.target.value),
                                            })
                                        }
                                    />
                                </Field>
                            ))}
                        </div>
                        <Field label="T-shirt fit">
                            <RadioGroup
                                name="tshirt_fit"
                                options={TSHIRT_FIT}
                                value={optional.tshirt_fit ?? ""}
                                onChange={(v) => setOptional({ ...optional, tshirt_fit: v })}
                            />
                        </Field>
                        <Field label="Jeans fit">
                            <RadioGroup
                                name="jeans_fit"
                                options={JEANS_FIT}
                                value={optional.jeans_fit ?? ""}
                                onChange={(v) => setOptional({ ...optional, jeans_fit: v })}
                            />
                        </Field>
                        <CheckboxGroup
                            label="Major buys"
                            options={MAJOR_BUYS}
                            values={optional.major_buys ?? []}
                            onToggle={(v) => toggleArray("major_buys", v)}
                        />
                        <CheckboxGroup
                            label="Seasonal preferences"
                            options={SEASONAL}
                            values={optional.seasonal_preferences ?? []}
                            onToggle={(v) => toggleArray("seasonal_preferences", v)}
                        />
                        <CheckboxGroup
                            label="Color families"
                            options={COLOR_FAMILIES}
                            values={optional.color_families ?? []}
                            onToggle={(v) => toggleArray("color_families", v)}
                        />
                        <CheckboxGroup
                            label="Activity profiles"
                            options={ACTIVITIES}
                            values={optional.activity_profiles ?? []}
                            onToggle={(v) => toggleArray("activity_profiles", v)}
                        />
                        <CheckboxGroup
                            label="Fit frustrations"
                            options={FIT_FRUSTRATIONS}
                            values={optional.fit_frustrations ?? []}
                            onToggle={(v) => toggleArray("fit_frustrations", v)}
                        />

                        <div className="pt-2 flex justify-between items-center">
                            <button
                                className="text-sm text-neutral-500 hover:text-neutral-800"
                                onClick={() => submitOptional(true)}
                                disabled={saving}
                            >
                                Skip for now
                            </button>
                            <button
                                className="btn-primary"
                                onClick={() => submitOptional(false)}
                                disabled={saving}
                            >
                                Save Preferences
                            </button>
                        </div>
                    </section>
                )}
            </div>

            <style jsx>{`
                .input {
                    width: 100%;
                    border: 1px solid rgb(229 229 229);
                    border-radius: 6px;
                    padding: 8px 10px;
                    font-size: 14px;
                }
                .input:focus {
                    outline: none;
                    border-color: rgb(23 23 23);
                }
                .btn-primary {
                    background: rgb(23 23 23);
                    color: white;
                    padding: 8px 16px;
                    border-radius: 6px;
                    font-size: 14px;
                }
                .btn-primary:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            `}</style>
        </main>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">{label}</span>
            {children}
        </label>
    );
}

function RadioGroup({
    name,
    options,
    value,
    onChange,
}: {
    name: string;
    options: Array<{ value: string; label: string }>;
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <div className="flex flex-wrap gap-2">
            {options.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange(opt.value)}
                    className={`px-3 py-1.5 rounded-md border text-sm ${
                        value === opt.value
                            ? "bg-neutral-900 text-white border-neutral-900"
                            : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400"
                    }`}
                    data-name={name}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

function CheckboxGroup({
    label,
    options,
    values,
    onToggle,
}: {
    label: string;
    options: Array<{ value: string; label: string }>;
    values: string[];
    onToggle: (v: string) => void;
}) {
    return (
        <div>
            <p className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">{label}</p>
            <div className="flex flex-wrap gap-2">
                {options.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onToggle(opt.value)}
                        className={`px-3 py-1.5 rounded-md border text-sm ${
                            values.includes(opt.value)
                                ? "bg-neutral-900 text-white border-neutral-900"
                                : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400"
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
