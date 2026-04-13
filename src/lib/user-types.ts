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
    onboarding_completed: boolean | null;
}
