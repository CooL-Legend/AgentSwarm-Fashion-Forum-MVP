"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { useAuth } from "@clerk/nextjs";
import { backendFetch } from "@/lib/backend-api";
import type { UserProfile } from "@/lib/user-types";

type UserProfileState = {
    user: UserProfile | null;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
};

const UserProfileContext = createContext<UserProfileState | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
    const { isLoaded, isSignedIn, userId } = useAuth();
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchedForUserId = useRef<string | null>(null);

    const fetchProfile = useCallback(async () => {
        if (!isSignedIn || !userId) return;
        setLoading(true);
        setError(null);
        try {
            const resp = await backendFetch("/api/users");
            if (!resp.ok) throw new Error(`Failed to load profile (${resp.status})`);
            const data = await resp.json();
            setUser(data?.user ?? null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load profile");
        } finally {
            setLoading(false);
        }
    }, [isSignedIn, userId]);

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn || !userId) {
            setUser(null);
            fetchedForUserId.current = null;
            return;
        }
        if (fetchedForUserId.current === userId) return;
        fetchedForUserId.current = userId;
        void fetchProfile();
    }, [isLoaded, isSignedIn, userId, fetchProfile]);

    return (
        <UserProfileContext.Provider
            value={{ user, loading, error, refetch: fetchProfile }}
        >
            {children}
        </UserProfileContext.Provider>
    );
}

export function useUserProfile(): UserProfileState {
    const ctx = useContext(UserProfileContext);
    if (!ctx) {
        throw new Error("useUserProfile must be used within UserProvider");
    }
    return ctx;
}
