export interface UserProfile {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    bio: string | null;
    email_id: string | null;
    phone_number: string | null;
    location: string | null;
    sex: string | null;
    height: string | null;
    front_image: string | null;
    back_image: string | null;
    images: string[] | null;
    created_at: string | null;
    updated_at: string | null;
    profile_vector: unknown;
    onboarding_completed: boolean | null;
    onboarding_skipped: boolean | null;
    onboarding_version: number | null;
    onboarding_completed_at: string | null;
    onboarding_skipped_at: string | null;

    age: number | null;
    occupation: string | null;
    height_cm: number | null;
    shoulder_width_cm: number | null;
    chest_bust_cm: number | null;
    arm_length_cm: number | null;
    waist_cm: number | null;
    thigh_cm: number | null;
    inseam_cm: number | null;
    visual_language: string | null;
    major_buys: string[] | null;
    seasonal_preferences: string[] | null;
    tshirt_fit: string | null;
    jeans_fit: string | null;
    color_families: string[] | null;
    activity_profiles: string[] | null;
    fit_frustrations: string[] | null;
}

export interface OnboardingAnswers {
    first_name: string;
    last_name: string;
    username: string;
    age: number | null;
    sex: string;
    visual_language: string;
    occupation: string;
    height_cm: number | null;
    shoulder_width_cm: number | null;
    chest_bust_cm: number | null;
    arm_length_cm: number | null;
    waist_cm: number | null;
    thigh_cm: number | null;
    inseam_cm: number | null;
    major_buys: string[];
    seasonal_preferences: string[];
    tshirt_fit: string;
    jeans_fit: string;
    color_families: string[];
    activity_profiles: string[];
    fit_frustrations: string[];
}
