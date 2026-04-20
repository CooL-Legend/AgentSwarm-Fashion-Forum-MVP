"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Sparkles, Check, User, Ruler, Palette, ShoppingBag, SlidersHorizontal, AlertCircle, Eye, X, Upload } from "lucide-react";
import { saveOnboardingData, checkOnboardingStatus, uploadUserMedia } from "@/app/actions/user";
import { toast } from "sonner";

interface StepConfig {
    id: string;
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    type: "form" | "single" | "multi" | "composite";
}

// Q1: Visual Language
const VISUAL_LANGUAGE_OPTIONS = [
    { value: "minimalist-monochromatic", label: "Minimalist & Monochromatic", emoji: "🤍", description: "Zero-branding, neutral tones, clean silhouettes" },
    { value: "raw-industrial", label: "Raw, Industrial & Brutalist", emoji: "🏗️", description: "Exposed hardware, concrete tones, distressed textures" },
    { value: "avant-garde", label: "Avant-Garde & Dramatic", emoji: "🎭", description: "Extreme shapes, high-contrast editorial" },
    { value: "classic-high-fashion", label: "Classic High-Fashion", emoji: "💎", description: "Sharp tailoring, high-gloss luxury materials" },
];

// Q2: Gender
const GENDER_OPTIONS = [
    { value: "male", label: "Male", emoji: "👔" },
    { value: "female", label: "Female", emoji: "👗" },
    { value: "non-binary", label: "Non-Binary / Prefer not to say", emoji: "✨" },
];

// Q6: Major Buys
const MAJOR_BUYS_OPTIONS = [
    { value: "tshirts-shirts", label: "T-shirts / Shirts", emoji: "👕" },
    { value: "jackets-outerwear", label: "Jackets & Outerwear", emoji: "🧥" },
    { value: "jeans-trousers", label: "Jeans / Trousers", emoji: "👖" },
];

// Q7: Seasonal Preferences
const SEASONAL_OPTIONS = [
    { value: "summer-breathable", label: "Summer: Breathable/Linen", emoji: "☀️", description: "Lightweight, natural fibers" },
    { value: "summer-techwear", label: "Summer: Tech-wear", emoji: "🧊", description: "Moisture-wicking synthetics" },
    { value: "winter-heavy", label: "Winter: Heavy Layering", emoji: "❄️", description: "400gsm+ thermal layers" },
    { value: "winter-overcoats", label: "Winter: Sharp Overcoats", emoji: "🧥", description: "Wool, structured long-form silhouettes" },
];

// Q8: T-Shirt Fit
const TSHIRT_FIT_OPTIONS = [
    { value: "oversized", label: "Oversized", emoji: "📦", description: "Dropped shoulders, boxy" },
    { value: "relaxed", label: "Relaxed", emoji: "👕", description: "Standard comfort fit" },
    { value: "slim", label: "Slim Fit", emoji: "📐", description: "Muscle-hugging, tapered" },
];

// Q9: Jeans Fit
const JEANS_FIT_OPTIONS = [
    { value: "oversized-baggy", label: "Oversized / Baggy", emoji: "👖", description: "Wide leg, skater silhouettes" },
    { value: "relaxed-straight", label: "Relaxed / Straight", emoji: "📏", description: "Classic straight, raw denim" },
    { value: "slim-tapered", label: "Slim / Tapered", emoji: "📐", description: "Athletic taper, stretch recovery" },
];

// Q10: Color Family
const COLOR_FAMILY_OPTIONS = [
    { value: "neutrals", label: "The Neutrals", description: "Concrete, Sand", color: "#C2B280" },
    { value: "voids", label: "The Voids", description: "Black, Charcoal", color: "#1a1a1a" },
    { value: "earth", label: "The Earth", description: "Olive, Rust", color: "#556B2F" },
    { value: "vibrants", label: "The Vibrants", description: "Neons", color: "#FF6B35" },
];

// Q11: Activities
const ACTIVITY_OPTIONS = [
    { value: "strength-training", label: "Strength Training", emoji: "🏋️" },
    { value: "football-basketball", label: "Football / Basketball", emoji: "⚽" },
    { value: "yoga-running", label: "Yoga / Running", emoji: "🧘" },
    { value: "creative-photography", label: "Creative / Photography", emoji: "📸" },
];

// Q12: Fit Frustrations (Men)
const FIT_FRUSTRATIONS_MALE = [
    { value: "shoulder-pinch", label: "The Shoulder Pinch", emoji: "👔", description: "Tight around shoulders" },
    { value: "tent-effect", label: "The \"Tent\" Effect", emoji: "⛺", description: "Too loose at waist" },
    { value: "arm-bicep-trap", label: "The Arm/Bicep Trap", emoji: "💪", description: "Sleeves too tight on arms" },
    { value: "quad-struggle", label: "The Quad Struggle", emoji: "🦵", description: "Thighs too tight in trousers" },
    { value: "torso-crop", label: "The Torso \"Crop\"", emoji: "📏", description: "Shirts ride up or too short" },
];

// Q13: Fit Frustrations (Women)
const FIT_FRUSTRATIONS_FEMALE = [
    { value: "waist-gap", label: "The Waist Gap", emoji: "👖", description: "Gap at waistband" },
    { value: "bust-gape", label: "The Bust Gape", emoji: "👚", description: "Buttons pulling open at bust" },
    { value: "hip-constraint", label: "The Hip Constraint", emoji: "👗", description: "Too tight at hips" },
    { value: "rise-struggle", label: "The Rise Struggle", emoji: "📐", description: "Wrong rise height" },
    { value: "petite-tall-sleeve", label: "The Petite/Tall Sleeve", emoji: "🧥", description: "Wrong sleeve length" },
];

const steps: StepConfig[] = [
    { id: "basic", icon: <User className="w-5 h-5" />, title: "Tell us about yourself", subtitle: "Let's set up your profile. You can always change this later.", type: "form" },
    { id: "visual-language", icon: <Eye className="w-5 h-5" />, title: "What's your visual language?", subtitle: "How would you describe your aesthetic?", type: "single" },
    { id: "about-you", icon: <User className="w-5 h-5" />, title: "About you", subtitle: "Help us personalize your experience.", type: "form" },
    { id: "body", icon: <Ruler className="w-5 h-5" />, title: "Physical Blueprint", subtitle: "Your body measurements help our VTON engine. Skip if you'd rather not share.", type: "form" },
    { id: "shopping", icon: <ShoppingBag className="w-5 h-5" />, title: "Shopping preferences", subtitle: "What do you buy most and when?", type: "composite" },
    { id: "fit-preferences", icon: <SlidersHorizontal className="w-5 h-5" />, title: "Your go-to fits", subtitle: "How do you like your clothes to fit?", type: "composite" },
    { id: "color-activities", icon: <Palette className="w-5 h-5" />, title: "Colors & Activities", subtitle: "Your dominant colors and lifestyle.", type: "composite" },
    { id: "fit-frustrations", icon: <AlertCircle className="w-5 h-5" />, title: "Fit frustrations", subtitle: "What's your #1 fit frustration?", type: "multi" },
    { id: "visual-reference", icon: <Sparkles className="w-5 h-5" />, title: "Visual Baseline", subtitle: "Upload 1-5 photos to help our AI understand your build and identity.", type: "composite" },
];

export default function OnboardingPage() {
    const router = useRouter();
    const { user: clerkUser, isLoaded } = useUser();
    const [currentStep, setCurrentStep] = useState(0);
    const [saving, setSaving] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(true);

    const [formData, setFormData] = useState({
        // Step 1: Basic
        displayName: "",
        username: "",
        // Step 2: Visual Language (Q1)
        visualLanguage: "",
        // Step 3: About You (Q2, Q3, Q4)
        gender: "",
        age: "",
        occupation: "",
        // Step 4: Body Measurements (Q5)
        height: "",
        shoulderWidth: "",
        chest: "",
        armLength: "",
        waist: "",
        thigh: "",
        inseam: "",
        // Step 5: Shopping (Q6, Q7)
        majorBuys: [] as string[],
        seasonalPreferences: [] as string[],
        // Step 6: Fit Preferences (Q8, Q9)
        tshirtFit: "",
        jeansFit: "",
        // Step 7: Color & Activities (Q10, Q11)
        colorFamily: "",
        activities: [] as string[],
        // Step 8: Fit Frustrations (Q12/Q13)
        fitFrustrations: [] as string[],
        // Step 9: Visual Reference
        images: [] as { file?: File, url: string, description?: string }[],
    });

    useEffect(() => {
        if (!isLoaded || !clerkUser) return;

        const checkStatus = async () => {
            if (clerkUser.publicMetadata?.onboarding_completed) {
                router.replace("/");
                return;
            }

            const completed = await checkOnboardingStatus(clerkUser.id);
            if (completed) {
                router.replace("/");
                return;
            }

            setCheckingStatus(false);
        };
        checkStatus();

        // Restore draft from localStorage
        if (typeof window !== 'undefined') {
            const draft = localStorage.getItem('onboarding_draft');
            if (draft) {
                try {
                    const { formData: savedData, currentStep: savedStep, timestamp } = JSON.parse(draft);
                    if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
                        setFormData(savedData);
                        setCurrentStep(savedStep);
                    }
                } catch (e) {
                    console.error('Error restoring draft:', e);
                }
            }
        }

        setFormData(prev => ({
            ...prev,
            displayName: prev.displayName || `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim(),
            username: prev.username || clerkUser.username || clerkUser.emailAddresses?.[0]?.emailAddress?.split("@")[0] || "",
        }));
    }, [isLoaded, clerkUser, router]);

    // Auto-save draft every 30 seconds
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const saveDraft = () => {
            localStorage.setItem('onboarding_draft', JSON.stringify({
                formData,
                currentStep,
                timestamp: Date.now()
            }));
        };
        const interval = setInterval(saveDraft, 30000);
        return () => clearInterval(interval);
    }, [formData, currentStep]);

    const totalSteps = steps.length;
    const progress = ((currentStep + 1) / totalSteps) * 100;
    const step = steps[currentStep];

    const canProceed = () => {
        switch (step.id) {
            case "basic":
                return formData.displayName.trim().length > 0 && formData.username.trim().length > 0;
            case "visual-language":
                return formData.visualLanguage.length > 0;
            case "about-you":
                return formData.gender.length > 0;
            case "body":
                return true; // Optional
            case "shopping":
                return formData.majorBuys.length > 0;
            case "fit-preferences":
                return formData.tshirtFit.length > 0 && formData.jeansFit.length > 0;
            case "color-activities":
                return formData.colorFamily.length > 0;
            case "fit-frustrations":
                return true; // Optional
            case "visual-reference":
                return formData.images.length >= 1;
            default:
                return true;
        }
    };

    const toggleMulti = (field: "majorBuys" | "seasonalPreferences" | "activities" | "fitFrustrations", value: string) => {
        setFormData(prev => {
            const current = prev[field];
            return {
                ...prev,
                [field]: current.includes(value)
                    ? current.filter(v => v !== value)
                    : [...current, value],
            };
        });
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (formData.images.length + files.length > 5) {
            toast.error("You can only upload up to 5 images.");
            return;
        }

        const newImages = files.map(file => ({
            file,
            url: URL.createObjectURL(file)
        }));

        setFormData(prev => ({
            ...prev,
            images: [...prev.images, ...newImages]
        }));
    };

    const handleNext = async () => {
        if (currentStep < totalSteps - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            if (!clerkUser) {
                toast.error("User session not found. Please refresh the page and try again.");
                return;
            }
            if (saving) return;
            setSaving(true);

            try {
                // 1. Upload images first
                const uploadedUrls: string[] = [];
                for (const img of formData.images) {
                    if (img.file) {
                        const fd = new FormData();
                        fd.append('user_id', clerkUser.id);
                        fd.append('file', img.file);
                        fd.append('view_type', 'front'); // Default for onboarding
                        const res = await uploadUserMedia(fd);
                        if (res.url) {
                            uploadedUrls.push(res.url);
                        } else if (res.error) {
                            throw new Error(res.error);
                        }
                    } else {
                        uploadedUrls.push(img.url);
                    }
                }

                // 2. Save profile data
                const result = await saveOnboardingData({
                    userId: clerkUser.id,
                    displayName: formData.displayName,
                    username: formData.username,
                    avatarUrl: clerkUser.imageUrl,
                    visualLanguage: formData.visualLanguage,
                    gender: formData.gender,
                    age: formData.age,
                    occupation: formData.occupation,
                    height: formData.height,
                    shoulderWidth: formData.shoulderWidth,
                    chest: formData.chest,
                    armLength: formData.armLength,
                    waist: formData.waist,
                    thigh: formData.thigh,
                    inseam: formData.inseam,
                    majorBuys: formData.majorBuys,
                    seasonalPreferences: formData.seasonalPreferences,
                    tshirtFit: formData.tshirtFit,
                    jeansFit: formData.jeansFit,
                    colorFamily: formData.colorFamily,
                    activities: formData.activities,
                    fitFrustrations: formData.fitFrustrations,
                    images: uploadedUrls
                });

                if (result.error) {
                    toast.error("Failed to save profile. Please try again.");
                    setSaving(false);
                    return;
                }

                if (typeof window !== 'undefined') {
                    localStorage.removeItem('onboarding_draft');
                }
                toast.success("Profile set up successfully!");
                router.push("/");
            } catch (err: any) {
                toast.error(err.message || "Failed to complete onboarding");
                setSaving(false);
            }
        }
    };

    const handleBack = () => {
        if (currentStep > 0) setCurrentStep(currentStep - 1);
    };

    if (!isLoaded || checkingStatus) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Progress bar */}
            <div className="fixed top-0 left-0 right-0 z-50">
                <div className="h-1 bg-white/5">
                    <motion.div
                        className="h-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.5, ease: "easeInOut" }}
                    />
                </div>
            </div>

            {/* Header */}
            <div className="pt-8 px-8 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
                        <span className="text-primary text-sm">💎</span>
                    </div>
                    <span className="text-lg font-black tracking-tight">TRY-OWN</span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="hidden sm:flex items-center gap-2">
                        {steps.map((s, i) => (
                            <div key={s.id} className={`w-2 h-2 rounded-full transition-colors ${i <= currentStep ? "bg-primary" : "bg-white/10"}`} />
                        ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                        Step {currentStep + 1} of {totalSteps}
                    </span>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex items-center justify-center px-6 py-12 overflow-y-auto">
                <div className="w-full max-w-2xl">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -50 }}
                            transition={{ duration: 0.3 }}
                        >
                            {/* Title */}
                            <div className="text-center mb-10">
                                <div className="inline-flex items-center gap-2 text-primary mb-3">
                                    {step.icon}
                                </div>
                                <h1 className="text-3xl md:text-4xl font-bold italic" style={{ fontFamily: "var(--font-display)" }}>
                                    {step.title}
                                </h1>
                                <p className="text-sm text-muted-foreground mt-3">{step.subtitle}</p>
                            </div>

                            {/* Step 1: Basic Info */}
                            {step.id === "basic" && (
                                <div className="space-y-6 max-w-md mx-auto">
                                    <div>
                                        <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-2 block">Display Name *</label>
                                        <input
                                            type="text"
                                            value={formData.displayName}
                                            onChange={e => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                                            placeholder="Your name"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-2 block">Username *</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                                            <input
                                                type="text"
                                                value={formData.username}
                                                onChange={e => setFormData(prev => ({ ...prev, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
                                                placeholder="username"
                                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Step 2: Visual Language (Q1) */}
                            {step.id === "visual-language" && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
                                    {VISUAL_LANGUAGE_OPTIONS.map(opt => (
                                        <motion.button
                                            key={opt.value}
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => setFormData(prev => ({ ...prev, visualLanguage: opt.value }))}
                                            className={`relative p-6 rounded-xl border text-left transition-all duration-200 ${formData.visualLanguage === opt.value
                                                ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
                                                : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                                                }`}
                                        >
                                            {formData.visualLanguage === opt.value && (
                                                <div className="absolute top-3 right-3 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                                    <Check className="w-3 h-3 text-primary-foreground" />
                                                </div>
                                            )}
                                            <div className="text-2xl mb-2">{opt.emoji}</div>
                                            <p className="font-semibold text-sm">{opt.label}</p>
                                            <p className="text-xs text-muted-foreground mt-1">{opt.description}</p>
                                        </motion.button>
                                    ))}
                                </div>
                            )}

                            {/* Step 3: About You (Q2 Gender, Q3 Age, Q4 Occupation) */}
                            {step.id === "about-you" && (
                                <div className="space-y-8 max-w-lg mx-auto">
                                    {/* Q2: Gender */}
                                    <div>
                                        <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-3 block">How do you identify? *</label>
                                        <div className="grid grid-cols-3 gap-3">
                                            {GENDER_OPTIONS.map(opt => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => setFormData(prev => ({ ...prev, gender: opt.value }))}
                                                    className={`relative p-4 rounded-xl border text-center transition-all duration-200 ${formData.gender === opt.value
                                                        ? "border-primary bg-primary/10"
                                                        : "border-white/10 bg-white/5 hover:border-white/20"
                                                        }`}
                                                >
                                                    {formData.gender === opt.value && (
                                                        <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                                            <Check className="w-3 h-3 text-primary-foreground" />
                                                        </div>
                                                    )}
                                                    <span className="text-xl mb-1 block">{opt.emoji}</span>
                                                    <span className="text-sm font-medium">{opt.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Q3: Age */}
                                    <div>
                                        <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-2 block">What is your age?</label>
                                        <input
                                            type="number"
                                            value={formData.age}
                                            onChange={e => setFormData(prev => ({ ...prev, age: e.target.value }))}
                                            placeholder="e.g. 25"
                                            min={13}
                                            max={100}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
                                        />
                                    </div>
                                    {/* Q4: Occupation */}
                                    <div>
                                        <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-2 block">What is your occupation?</label>
                                        <input
                                            type="text"
                                            value={formData.occupation}
                                            onChange={e => setFormData(prev => ({ ...prev, occupation: e.target.value }))}
                                            placeholder="e.g. Producer, Corporate, Student..."
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Step 4: Body Measurements (Q5) */}
                            {step.id === "body" && (
                                <div className="space-y-5 max-w-lg mx-auto">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-2 block">Height</label>
                                            <input
                                                type="text"
                                                value={formData.height}
                                                onChange={e => setFormData(prev => ({ ...prev, height: e.target.value }))}
                                                placeholder={"e.g. 5'9\" or 175cm"}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-2 block">Shoulder Width</label>
                                            <input
                                                type="text"
                                                value={formData.shoulderWidth}
                                                onChange={e => setFormData(prev => ({ ...prev, shoulderWidth: e.target.value }))}
                                                placeholder="in inches or cm"
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-2 block">{formData.gender === "female" ? "Bust" : "Chest"}</label>
                                            <input
                                                type="text"
                                                value={formData.chest}
                                                onChange={e => setFormData(prev => ({ ...prev, chest: e.target.value }))}
                                                placeholder="in inches or cm"
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-2 block">Arm Length</label>
                                            <input
                                                type="text"
                                                value={formData.armLength}
                                                onChange={e => setFormData(prev => ({ ...prev, armLength: e.target.value }))}
                                                placeholder="in inches or cm"
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-2 block">Waist</label>
                                            <input
                                                type="text"
                                                value={formData.waist}
                                                onChange={e => setFormData(prev => ({ ...prev, waist: e.target.value }))}
                                                placeholder="inches/cm"
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-2 block">Thigh</label>
                                            <input
                                                type="text"
                                                value={formData.thigh}
                                                onChange={e => setFormData(prev => ({ ...prev, thigh: e.target.value }))}
                                                placeholder="inches/cm"
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-2 block">Inseam</label>
                                            <input
                                                type="text"
                                                value={formData.inseam}
                                                onChange={e => setFormData(prev => ({ ...prev, inseam: e.target.value }))}
                                                placeholder="inches/cm"
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground text-center mt-2">All measurements are optional and used to improve virtual try-on accuracy.</p>
                                </div>
                            )}

                            {/* Step 5: Shopping (Q6 Major Buys + Q7 Seasonal) */}
                            {step.id === "shopping" && (
                                <div className="space-y-10 max-w-lg mx-auto">
                                    {/* Q6: Major Buys */}
                                    <div>
                                        <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-3 block">What are your major buys? *</label>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            {MAJOR_BUYS_OPTIONS.map(opt => (
                                                <motion.button
                                                    key={opt.value}
                                                    whileHover={{ scale: 1.02 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={() => toggleMulti("majorBuys", opt.value)}
                                                    className={`relative p-5 rounded-xl border text-center transition-all duration-200 ${formData.majorBuys.includes(opt.value)
                                                        ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
                                                        : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                                                        }`}
                                                >
                                                    {formData.majorBuys.includes(opt.value) && (
                                                        <div className="absolute top-3 right-3 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                                            <Check className="w-3 h-3 text-primary-foreground" />
                                                        </div>
                                                    )}
                                                    <div className="text-2xl mb-2">{opt.emoji}</div>
                                                    <p className="font-semibold text-sm">{opt.label}</p>
                                                </motion.button>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Q7: Seasonal Preferences */}
                                    <div>
                                        <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-3 block">Seasonal Preferences</label>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {SEASONAL_OPTIONS.map(opt => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => toggleMulti("seasonalPreferences", opt.value)}
                                                    className={`relative p-4 rounded-xl border text-left transition-all duration-200 ${formData.seasonalPreferences.includes(opt.value)
                                                        ? "border-primary bg-primary/10"
                                                        : "border-white/10 bg-white/5 hover:border-white/20"
                                                        }`}
                                                >
                                                    {formData.seasonalPreferences.includes(opt.value) && (
                                                        <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                                            <Check className="w-3 h-3 text-primary-foreground" />
                                                        </div>
                                                    )}
                                                    <span className="text-xl mb-1 block">{opt.emoji}</span>
                                                    <p className="font-semibold text-sm">{opt.label}</p>
                                                    <p className="text-xs text-muted-foreground mt-1">{opt.description}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Step 6: Fit Preferences (Q8 T-Shirt + Q9 Jeans) */}
                            {step.id === "fit-preferences" && (
                                <div className="space-y-10 max-w-lg mx-auto">
                                    {/* Q8: T-Shirt Fit */}
                                    <div>
                                        <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-3 block">Go-to T-Shirt Fit *</label>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            {TSHIRT_FIT_OPTIONS.map(opt => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => setFormData(prev => ({ ...prev, tshirtFit: opt.value }))}
                                                    className={`relative p-5 rounded-xl border text-center transition-all duration-200 ${formData.tshirtFit === opt.value
                                                        ? "border-primary bg-primary/10"
                                                        : "border-white/10 bg-white/5 hover:border-white/20"
                                                        }`}
                                                >
                                                    {formData.tshirtFit === opt.value && (
                                                        <div className="absolute top-3 right-3 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                                            <Check className="w-3 h-3 text-primary-foreground" />
                                                        </div>
                                                    )}
                                                    <span className="text-2xl mb-1 block">{opt.emoji}</span>
                                                    <p className="font-semibold text-sm">{opt.label}</p>
                                                    <p className="text-xs text-muted-foreground mt-1">{opt.description}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Q9: Jeans Fit */}
                                    <div>
                                        <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-3 block">Go-to Jeans Fit *</label>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            {JEANS_FIT_OPTIONS.map(opt => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => setFormData(prev => ({ ...prev, jeansFit: opt.value }))}
                                                    className={`relative p-5 rounded-xl border text-center transition-all duration-200 ${formData.jeansFit === opt.value
                                                        ? "border-primary bg-primary/10"
                                                        : "border-white/10 bg-white/5 hover:border-white/20"
                                                        }`}
                                                >
                                                    {formData.jeansFit === opt.value && (
                                                        <div className="absolute top-3 right-3 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                                            <Check className="w-3 h-3 text-primary-foreground" />
                                                        </div>
                                                    )}
                                                    <span className="text-2xl mb-1 block">{opt.emoji}</span>
                                                    <p className="font-semibold text-sm">{opt.label}</p>
                                                    <p className="text-xs text-muted-foreground mt-1">{opt.description}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Step 7: Color Family (Q10) + Activities (Q11) */}
                            {step.id === "color-activities" && (
                                <div className="space-y-10 max-w-lg mx-auto">
                                    {/* Q10: Color Family */}
                                    <div>
                                        <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-3 block">Which color family do you dominate? *</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            {COLOR_FAMILY_OPTIONS.map(opt => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => setFormData(prev => ({ ...prev, colorFamily: opt.value }))}
                                                    className={`relative flex items-center gap-3 p-4 rounded-xl border text-left transition-all duration-200 ${formData.colorFamily === opt.value
                                                        ? "border-primary bg-primary/10"
                                                        : "border-white/10 bg-white/5 hover:border-white/20"
                                                        }`}
                                                >
                                                    {formData.colorFamily === opt.value && (
                                                        <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                                            <Check className="w-3 h-3 text-primary-foreground" />
                                                        </div>
                                                    )}
                                                    <span
                                                        className="w-8 h-8 rounded-full border border-white/20 flex-shrink-0"
                                                        style={{ backgroundColor: opt.color }}
                                                    />
                                                    <div>
                                                        <p className="font-semibold text-sm">{opt.label}</p>
                                                        <p className="text-xs text-muted-foreground">{opt.description}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Q11: Activities */}
                                    <div>
                                        <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-3 block">What activities do you identify with?</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            {ACTIVITY_OPTIONS.map(opt => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => toggleMulti("activities", opt.value)}
                                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm transition-all ${formData.activities.includes(opt.value)
                                                        ? "border-primary bg-primary/10 text-white"
                                                        : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20"
                                                        }`}
                                                >
                                                    <span className="text-xl">{opt.emoji}</span>
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Step 8: Fit Frustrations (Q12/Q13) */}
                            {step.id === "fit-frustrations" && (
                                <div className="space-y-6 max-w-lg mx-auto">
                                    {formData.gender === "female" ? (
                                        <div>
                                            <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-3 block">Your #1 Fit Frustration</label>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {FIT_FRUSTRATIONS_FEMALE.map(opt => (
                                                    <button
                                                        key={opt.value}
                                                        onClick={() => toggleMulti("fitFrustrations", opt.value)}
                                                        className={`relative p-4 rounded-xl border text-left transition-all duration-200 ${formData.fitFrustrations.includes(opt.value)
                                                            ? "border-primary bg-primary/10"
                                                            : "border-white/10 bg-white/5 hover:border-white/20"
                                                            }`}
                                                    >
                                                        {formData.fitFrustrations.includes(opt.value) && (
                                                            <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                                                <Check className="w-3 h-3 text-primary-foreground" />
                                                            </div>
                                                        )}
                                                        <span className="text-xl mb-1 block">{opt.emoji}</span>
                                                        <p className="font-semibold text-sm">{opt.label}</p>
                                                        <p className="text-xs text-muted-foreground mt-1">{opt.description}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-3 block">Your #1 Fit Frustration</label>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {FIT_FRUSTRATIONS_MALE.map(opt => (
                                                    <button
                                                        key={opt.value}
                                                        onClick={() => toggleMulti("fitFrustrations", opt.value)}
                                                        className={`relative p-4 rounded-xl border text-left transition-all duration-200 ${formData.fitFrustrations.includes(opt.value)
                                                            ? "border-primary bg-primary/10"
                                                            : "border-white/10 bg-white/5 hover:border-white/20"
                                                            }`}
                                                    >
                                                        {formData.fitFrustrations.includes(opt.value) && (
                                                            <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                                                <Check className="w-3 h-3 text-primary-foreground" />
                                                            </div>
                                                        )}
                                                        <span className="text-xl mb-1 block">{opt.emoji}</span>
                                                        <p className="font-semibold text-sm">{opt.label}</p>
                                                        <p className="text-xs text-muted-foreground mt-1">{opt.description}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Step 9: Visual Reference */}
                            {step.id === "visual-reference" && (
                                <div className="space-y-6 max-w-lg mx-auto">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                        {formData.images.map((img, i) => (
                                            <div key={i} className="relative aspect-[3/4] rounded-xl overflow-hidden bg-white/5 border border-white/10 group">
                                                <img src={img.url} className="w-full h-full object-cover" />
                                                <button
                                                    onClick={() => setFormData(prev => ({ ...prev, images: prev.images.filter((_, idx) => idx !== i) }))}
                                                    className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                        {formData.images.length < 5 && (
                                            <label className="aspect-[3/4] rounded-xl border border-dashed border-white/20 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors">
                                                <input
                                                    type="file"
                                                    className="hidden"
                                                    accept="image/*"
                                                    multiple
                                                    onChange={handleFileSelect}
                                                />
                                                <Upload className="w-6 h-6 text-muted-foreground mb-2" />
                                                <span className="text-xs text-muted-foreground">Add Photo</span>
                                            </label>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground text-center">
                                        Upload 1-5 clear photos of yourself (front, side, etc.) to help our AI reconstruct your build precisely.
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* Bottom navigation */}
            <div className="px-8 pb-8 flex items-center justify-between">
                <button
                    onClick={handleBack}
                    disabled={currentStep === 0}
                    className={`flex items-center gap-2 text-sm font-medium transition-colors ${currentStep === 0 ? "text-muted-foreground/30 cursor-not-allowed" : "text-muted-foreground hover:text-white"}`}
                >
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>

                <div className="flex items-center gap-3">
                    {(step.id === "body" || step.id === "fit-frustrations") && (
                        <button
                            onClick={() => setCurrentStep(currentStep + 1)}
                            className="text-sm text-muted-foreground hover:text-white transition-colors"
                        >
                            Skip
                        </button>
                    )}
                    <button
                        onClick={handleNext}
                        disabled={!canProceed() || saving}
                        className={`flex items-center gap-2 px-8 py-3 rounded-full text-sm font-bold tracking-wider uppercase transition-all ${canProceed() && !saving
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90"
                            : "bg-white/10 text-muted-foreground/50 cursor-not-allowed"
                            }`}
                    >
                        {saving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                Saving...
                            </>
                        ) : currentStep === totalSteps - 1 ? (
                            <>Complete Setup <Sparkles className="w-4 h-4" /></>
                        ) : (
                            <>Next <ArrowRight className="w-4 h-4" /></>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
