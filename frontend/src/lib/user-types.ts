export interface UserProfile {
    id: string;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    bio: string | null;
    email: string | null;
    phone_number: string | null;
    location: string | null;
    gender_identity: string | null;
    date_of_birth: string | null;
    created_at: string | null;
    updated_at: string | null;
    onboarding_completed: boolean | null;

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
