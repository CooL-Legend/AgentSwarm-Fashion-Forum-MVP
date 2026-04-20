'use server'

import { revalidatePath } from 'next/cache'
import { clerkClient } from '@clerk/nextjs/server'
import { apiFetch } from '@/lib/api-client'

export interface OnboardingData {
    userId: string
    displayName: string
    username: string
    avatarUrl?: string
    visualLanguage?: string
    gender?: string
    age?: string
    occupation?: string
    height?: string
    shoulderWidth?: string
    chest?: string
    armLength?: string
    waist?: string
    thigh?: string
    inseam?: string
    majorBuys?: string[]
    seasonalPreferences?: string[]
    tshirtFit?: string
    jeansFit?: string
    colorFamily?: string
    activities?: string[]
    fitFrustrations?: string[]
    images?: string[]
}

export interface UserProfile {
    id: string
    username: string
    first_name: string | null
    last_name: string | null
    display_name: string | null
    avatar_url: string | null
    bio: string | null
    location: string | null
    gender: string | null
    occupation: string | null
    height: string | null
    waist: string | null
    onboarding_completed: boolean
    role: string
    is_verified: boolean
    streak_count: number
    last_active_date: string | null
    created_at: string
    visual_language: string | null
    age: string | null
    shoulder_width: string | null
    chest: string | null
    arm_length: string | null
    thigh: string | null
    inseam: string | null
    major_buys: string[]
    seasonal_preferences: string[]
    tshirt_fit: string | null
    jeans_fit: string | null
    color_family: string | null
    activities: string[]
    fit_frustrations: string[]
}

export async function saveOnboardingData(data: OnboardingData) {
    if (!data.userId) {
        return { error: 'User ID is required' }
    }

    const requestBody = {
        userId: data.userId,
        displayName: data.displayName,
        username: data.username,
        avatarUrl: data.avatarUrl || null,
        visualLanguage: data.visualLanguage || null,
        gender: data.gender || null,
        age: data.age || null,
        occupation: data.occupation || null,
        height: data.height || null,
        shoulderWidth: data.shoulderWidth || null,
        chest: data.chest || null,
        armLength: data.armLength || null,
        waist: data.waist || null,
        thigh: data.thigh || null,
        inseam: data.inseam || null,
        majorBuys: data.majorBuys || [],
        seasonalPreferences: data.seasonalPreferences || [],
        tshirtFit: data.tshirtFit || null,
        jeansFit: data.jeansFit || null,
        colorFamily: data.colorFamily || null,
        activities: data.activities || [],
        fitFrustrations: data.fitFrustrations || [],
    }

    const response = await apiFetch(`/user/${data.userId}/onboarding`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return { error: (errorData as { error?: string }).error || 'Failed to save onboarding data' }
    }

    try {
        const client = await clerkClient()
        await client.users.updateUser(data.userId, {
            publicMetadata: {
                onboarding_completed: true,
            },
        })
    } catch (clerkError) {
        console.error('Error syncing to Clerk metadata:', clerkError)
    }

    revalidatePath('/', 'layout')
    return { success: true as const }
}

export async function checkOnboardingStatus(userId: string): Promise<boolean> {
    try {
        const response = await apiFetch(`/user/${userId}/onboarding-status`)
        if (!response.ok) return false

        const data = await response.json()
        return !!data.onboarding_completed
    } catch (e) {
        console.error('Error checking onboarding status:', e)
        return false
    }
}

export async function uploadUserMedia(formData: FormData) {
    const response = await apiFetch('/user/upload-media', {
        method: 'POST',
        body: formData,
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }))
        return { error: (error as { error?: string }).error || 'Upload failed' }
    }

    return await response.json()
}
